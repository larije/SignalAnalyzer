import type { SignalHistorySnapshot } from './signalHistoryCore';
import type { EnrichedTradeRecord } from './patternDatabaseCore';

export interface BrowserData {
  version: 1;
  history: SignalHistorySnapshot;
  patterns: EnrichedTradeRecord[];
  /** Last processed candle CLOSE time, in milliseconds. */
  lastCandle: { BTC: number; XAU: number };
}

export interface BrowserStore {
  readonly persistent: boolean;
  read(): Promise<BrowserData>;
  update(mutator: (current: BrowserData) => BrowserData): Promise<BrowserData>;
  replace(data: BrowserData): Promise<BrowserData>;
  close(): void;
}

export function emptyBrowserData(): BrowserData {
  return { version: 1, history: { entries: [], calibration: [] }, patterns: [], lastCandle: { BTC: 0, XAU: 0 } };
}

const DATABASE_NAME = 'signal-analyzer-browser';
const DATABASE_VERSION = 1;
const STORE_NAME = 'snapshots';
const SNAPSHOT_KEY = 'current';
const MAX_BACKUP_LENGTH = 5_000_000;

type RecordValue = Record<string, unknown>;
const isRecord = (value: unknown): value is RecordValue => typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nonnegative = (value: unknown): value is number => finite(value) && value >= 0;
const positive = (value: unknown): value is number => finite(value) && value > 0;
const integer = (value: unknown): value is number => nonnegative(value) && Number.isSafeInteger(value);
const percent = (value: unknown): value is number => nonnegative(value) && value <= 100;
const named = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 256;
const member = (value: unknown, options: readonly string[]): boolean => typeof value === 'string' && options.includes(value);
const onlyKeys = (value: RecordValue, allowed: readonly string[]): boolean => Object.keys(value).every(key => allowed.includes(key));
const optional = (value: RecordValue, key: string, check: (value: unknown) => boolean): boolean => value[key] === undefined || check(value[key]);
const list = (value: unknown, cap: number, check: (item: unknown) => boolean): value is unknown[] => Array.isArray(value) && value.length <= cap && Array.from(value).every(check);

const SIGNALS = ['STRONG_BUY', 'BUY', 'HOLD', 'SELL', 'STRONG_SELL', 'NO_TRADE'];
const OUTCOMES = ['WIN', 'LOSS', 'TIMEOUT', 'PENDING'];
const DIRECTIONS = ['BULLISH', 'BEARISH', 'NEUTRAL'];
const SCORE_KEYS = ['rsi', 'macd', 'bb', 'ema', 'stoch', 'volume', 'structure', 'mtf'];
const TRADE_KEYS = ['id', 'timestamp', 'asset', 'entryPrice', 'stopLoss', 'takeProfit', 'outcome', 'exitPrice', 'pnlPct', 'holdMinutes'];

function validTrade(value: RecordValue): boolean {
  return named(value.id) && integer(value.timestamp) && member(value.asset, ['BTC', 'XAU'])
    && positive(value.entryPrice) && positive(value.stopLoss) && positive(value.takeProfit)
    && member(value.outcome, OUTCOMES) && optional(value, 'exitPrice', positive)
    && optional(value, 'pnlPct', finite) && optional(value, 'holdMinutes', nonnegative);
}

function validHistoryEntry(value: unknown): boolean {
  return isRecord(value) && onlyKeys(value, [...TRADE_KEYS, 'signal', 'score', 'confidence', 'pnl'])
    && validTrade(value) && member(value.signal, SIGNALS) && finite(value.score)
    && percent(value.confidence) && optional(value, 'pnl', finite);
}

function validFeatures(value: unknown): boolean {
  if (!isRecord(value) || !onlyKeys(value, ['pattern', 'patternConfidence', 'patternDirection', 'regime', 'regimeDirection', 'mtfAlignment', 'dominantBias', 'structureType', 'volumeConfirmation', 'session', 'signalType', 'score', 'confidence', 'rr', 'componentScores'])) return false;
  return member(value.pattern, ['BULL_FLAG', 'BEAR_FLAG', 'ASCENDING_TRIANGLE', 'DESCENDING_TRIANGLE', 'SYMMETRICAL_TRIANGLE', 'DOUBLE_TOP', 'DOUBLE_BOTTOM', 'HEAD_AND_SHOULDERS', 'INVERSE_HEAD_AND_SHOULDERS', 'ASCENDING_CHANNEL', 'DESCENDING_CHANNEL', 'RISING_WEDGE', 'FALLING_WEDGE', 'NONE'])
    && percent(value.patternConfidence) && member(value.patternDirection, DIRECTIONS)
    && member(value.regime, ['TRENDING', 'RANGING', 'COMPRESSION', 'EXPANSION', 'REVERSAL'])
    && member(value.regimeDirection, DIRECTIONS) && percent(value.mtfAlignment)
    && member(value.dominantBias, ['BULLISH', 'BEARISH', 'MIXED'])
    && member(value.structureType, ['STRONG_UPTREND', 'WEAK_UPTREND', 'RANGE', 'WEAK_DOWNTREND', 'STRONG_DOWNTREND'])
    && member(value.volumeConfirmation, ['STRONG_BULL', 'BULL', 'NEUTRAL', 'BEAR', 'STRONG_BEAR'])
    && member(value.session, ['ASIAN', 'LONDON', 'NEW_YORK', 'LONDON_NY_OVERLAP', 'OFF_HOURS'])
    && member(value.signalType, SIGNALS) && finite(value.score) && percent(value.confidence)
    && nonnegative(value.rr) && isRecord(value.componentScores)
    && onlyKeys(value.componentScores, SCORE_KEYS)
    && SCORE_KEYS.every(key => finite((value.componentScores as RecordValue)[key]));
}

function validPattern(value: unknown): boolean {
  return isRecord(value) && onlyKeys(value, [...TRADE_KEYS, 'features']) && validTrade(value) && validFeatures(value.features);
}

function validBucket(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== 2) return false;
  const [key, count] = value;
  return integer(key) && key <= 10 && isRecord(count) && onlyKeys(count, ['wins', 'total'])
    && integer(count.wins) && integer(count.total) && count.wins <= count.total;
}

function uniqueIds(values: unknown[]): boolean {
  return new Set(values.map(value => (value as RecordValue).id)).size === values.length;
}

/** Validate the whole versioned snapshot; never discard unknown fields or excess records. */
export function validateBrowserData(value: unknown): value is BrowserData {
  try {
    if (!isRecord(value) || !onlyKeys(value, ['version', 'history', 'patterns', 'lastCandle']) || value.version !== 1) return false;
    if (!isRecord(value.history) || !onlyKeys(value.history, ['entries', 'calibration'])) return false;
    const { entries, calibration } = value.history;
    if (!list(entries, 500, validHistoryEntry) || !uniqueIds(entries)) return false;
    if (!list(value.patterns, 1000, validPattern) || !uniqueIds(value.patterns)) return false;
    if (!list(calibration, 11, validBucket) || new Set(calibration.map(bucket => (bucket as unknown[])[0])).size !== calibration.length) return false;
    return isRecord(value.lastCandle) && onlyKeys(value.lastCandle, ['BTC', 'XAU'])
      && integer(value.lastCandle.BTC) && integer(value.lastCandle.XAU);
  } catch {
    return false;
  }
}

function assertBrowserData(value: unknown, message = 'This backup has an unsupported version or invalid data. Nothing was replaced.'): asserts value is BrowserData {
  if (!validateBrowserData(value)) throw new Error(message);
}

/** JSON-compatible snapshots are copied so callers cannot mutate saved state by reference. */
function copy(data: BrowserData): BrowserData {
  return JSON.parse(JSON.stringify(data)) as BrowserData;
}

export function parseBackup(text: string): BrowserData {
  if (typeof text !== 'string' || text.length > MAX_BACKUP_LENGTH) throw new Error('This backup is too large to import. Nothing was replaced.');
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error('This file is not valid JSON. Nothing was replaced.'); }
  assertBrowserData(value);
  return value;
}

export function serializeBackup(data: BrowserData): string {
  assertBrowserData(data, 'The current browser data is invalid and cannot be exported.');
  return JSON.stringify(data, null, 2);
}

type Operation = { kind: 'read' } | { kind: 'update'; mutate: (current: BrowserData) => BrowserData } | { kind: 'replace'; data: BrowserData };

function databaseStore(database: IDBDatabase): BrowserStore {
  let closed = false;
  const close = () => { closed = true; database.close(); };
  database.onversionchange = close;
  database.onclose = () => { closed = true; };

  const transact = (operation: Operation): Promise<BrowserData> => new Promise((resolve, reject) => {
    let transaction: IDBTransaction;
    let result: BrowserData | undefined;
    let failure: unknown;
    try {
      if (closed) throw new Error('Browser storage is closed. Reload the page to reconnect.');
      if (operation.kind === 'replace') {
        assertBrowserData(operation.data);
        // Capture the approved replacement before waiting for a transaction slot.
        result = copy(operation.data);
      }
      transaction = database.transaction(STORE_NAME, operation.kind === 'read' ? 'readonly' : 'readwrite');
    } catch (error) { reject(error); return; }

    transaction.oncomplete = () => {
      if (result) resolve(copy(result));
      else reject(new Error('Browser storage completed without returning data.'));
    };
    transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('Browser storage could not save the update. Existing data was preserved.'));
    transaction.onerror = () => { failure ??= transaction.error; };

    const abort = (error: unknown) => {
      failure = error;
      try { transaction.abort(); } catch { reject(error); }
    };

    try {
      const store = transaction.objectStore(STORE_NAME);
      if (operation.kind === 'replace') {
        // Explicit user-approved restore can repair a corrupt prior snapshot.
        store.put(result, SNAPSHOT_KEY);
        return;
      }
      // getKey distinguishes a missing row from a corrupt row containing undefined.
      const present = store.getKey(SNAPSHOT_KEY);
      const request = store.get(SNAPSHOT_KEY);
      request.onsuccess = () => {
        try {
          const current: unknown = present.result === undefined ? emptyBrowserData() : request.result;
          assertBrowserData(current, 'Saved browser data is invalid or from a newer version. It was preserved; restore a valid backup to continue.');
          if (operation.kind === 'read') {
            result = current;
          } else {
            const next = operation.mutate(current);
            assertBrowserData(next, 'The browser data update was invalid. Existing data was preserved.');
            result = copy(next);
            store.put(result, SNAPSHOT_KEY);
          }
        } catch (error) { abort(error); }
      };
    } catch (error) { abort(error); }
  });

  return {
    persistent: true,
    read: () => transact({ kind: 'read' }),
    update: mutate => transact({ kind: 'update', mutate }),
    replace: data => transact({ kind: 'replace', data }),
    close,
  };
}

/** IndexedDB failures are surfaced; choosing a temporary session is a separate UI action. */
export function openBrowserStore(): Promise<BrowserStore> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser cannot use persistent storage. A temporary session must be selected explicitly.'));
      return;
    }
    let settled = false;
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = event => {
      if (settled) { request.transaction?.abort(); return; }
      if (event.oldVersion === 0) request.result.createObjectStore(STORE_NAME);
    };
    request.onerror = () => { settled = true; reject(request.error ?? new Error('Browser storage could not be opened.')); };
    request.onblocked = () => {
      settled = true;
      reject(new Error('Browser storage is blocked by another open tab. Close the other tab and try again.'));
    };
    request.onsuccess = () => {
      const database = request.result;
      if (settled) { database.close(); return; }
      settled = true;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.close();
        reject(new Error('The browser storage structure is unsupported. Existing data was preserved.'));
        return;
      }
      resolve(databaseStore(database));
    };
  });
}

/** An explicitly selected, isolated temporary session. Never writes over IndexedDB. */
export function createMemoryBrowserStore(): BrowserStore {
  let data = emptyBrowserData();
  let closed = false;
  const checkOpen = () => { if (closed) throw new Error('Temporary browser storage is closed.'); };
  return {
    persistent: false,
    async read() { checkOpen(); return copy(data); },
    async update(mutator) {
      checkOpen();
      const next = mutator(copy(data));
      assertBrowserData(next, 'The browser data update was invalid. Existing data was preserved.');
      data = copy(next);
      return copy(data);
    },
    async replace(replacement) {
      checkOpen();
      assertBrowserData(replacement);
      data = copy(replacement);
      return copy(data);
    },
    close() { closed = true; },
  };
}
