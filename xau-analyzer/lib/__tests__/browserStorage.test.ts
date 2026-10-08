import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import {
  createMemoryBrowserStore, emptyBrowserData, openBrowserStore,
  parseBackup, serializeBackup, validateBrowserData,
  type BrowserData, type BrowserStore,
} from '../browserStorage';

function populated(): BrowserData {
  return {
    version: 1,
    history: {
      entries: [{ id: 'BTC-1', timestamp: 60_000, asset: 'BTC', signal: 'BUY', score: 42, confidence: 72, entryPrice: 100, stopLoss: 98, takeProfit: 104, outcome: 'WIN', exitPrice: 104, pnl: 3.9, pnlPct: 3.9, holdMinutes: 1 }],
      calibration: [[7, { wins: 1, total: 1 }]],
    },
    patterns: [{
      id: 'BTC-1', timestamp: 60_000, asset: 'BTC', entryPrice: 100, stopLoss: 98, takeProfit: 104, outcome: 'WIN', exitPrice: 104, pnlPct: 3.9, holdMinutes: 1,
      features: {
        pattern: 'BULL_FLAG', patternConfidence: 80, patternDirection: 'BULLISH', regime: 'TRENDING', regimeDirection: 'BULLISH', mtfAlignment: 80, dominantBias: 'BULLISH', structureType: 'STRONG_UPTREND', volumeConfirmation: 'BULL', session: 'LONDON', signalType: 'BUY', score: 42, confidence: 72, rr: 2,
        componentScores: { rsi: 10, macd: 10, bb: 5, ema: 7, stoch: 5, volume: 5, structure: 10, mtf: 15 },
      },
    }],
    lastCandle: { BTC: 119_999, XAU: 59_999 },
  };
}

const stores: BrowserStore[] = [];
async function open(): Promise<BrowserStore> {
  const store = await openBrowserStore();
  stores.push(store);
  return store;
}

beforeEach(() => { vi.stubGlobal('indexedDB', new IDBFactory()); });
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('browser backup format', () => {
  it('round-trips every snapshot field and accepts empty first-run data', () => {
    expect(validateBrowserData(emptyBrowserData())).toBe(true);
    expect(parseBackup(serializeBackup(populated()))).toEqual(populated());
    const empty = emptyBrowserData();
    empty.lastCandle.BTC = 1;
    expect(emptyBrowserData().lastCandle.BTC).toBe(0);
  });

  it('accepts absent optional lifecycle fields even on completed records', () => {
    const value = populated();
    for (const field of ['exitPrice', 'pnl', 'pnlPct', 'holdMinutes'] as const) delete value.history.entries[0][field];
    for (const field of ['exitPrice', 'pnlPct', 'holdMinutes'] as const) delete value.patterns[0][field];
    expect(parseBackup(JSON.stringify(value))).toEqual(value);
  });

  it.each([
    ['future version', (v: BrowserData) => { (v as { version: number }).version = 2; }],
    ['invalid signal', (v: BrowserData) => { v.history.entries[0].signal = 'INVALID' as never; }],
    ['invalid outcome', (v: BrowserData) => { v.patterns[0].outcome = 'OPEN' as never; }],
    ['unknown pattern', (v: BrowserData) => { v.patterns[0].features.pattern = 'UNKNOWN' as never; }],
    ['unknown session', (v: BrowserData) => { v.patterns[0].features.session = 'TOKYO' as never; }],
    ['missing nested score', (v: BrowserData) => { delete (v.patterns[0].features.componentScores as Partial<typeof v.patterns[0]['features']['componentScores']>).mtf; }],
    ['nonfinite score', (v: BrowserData) => { v.patterns[0].features.componentScores.rsi = Infinity; }],
    ['nonfinite optional value', (v: BrowserData) => { v.history.entries[0].pnlPct = NaN; }],
    ['null optional value', (v: BrowserData) => { v.patterns[0].exitPrice = null as never; }],
    ['invalid cursor', (v: BrowserData) => { v.lastCandle.BTC = -1; }],
    ['fractional cursor', (v: BrowserData) => { v.lastCandle.XAU = 1.5; }],
    ['duplicate history id', (v: BrowserData) => { v.history.entries.push({ ...v.history.entries[0] }); }],
    ['duplicate pattern id', (v: BrowserData) => { v.patterns.push({ ...v.patterns[0] }); }],
    ['duplicate calibration bucket', (v: BrowserData) => { v.history.calibration.push([7, { wins: 0, total: 1 }]); }],
    ['impossible calibration count', (v: BrowserData) => { v.history.calibration[0][1].wins = 2; }],
    ['unknown field', (v: BrowserData) => { (v as unknown as Record<string, unknown>).other = 'do not silently discard'; }],
  ])('rejects %s without accepting a partial backup', (_name, change) => {
    const value = populated();
    change(value);
    expect(validateBrowserData(value)).toBe(false);
    expect(() => parseBackup(JSON.stringify(value))).toThrow();
    expect(() => serializeBackup(value)).toThrow();
  });

  it('accepts caps exactly, rejects excess records, and never prunes', () => {
    const value = populated();
    value.history.entries = Array.from({ length: 500 }, (_, i) => ({ ...value.history.entries[0], id: `h-${i}` }));
    value.patterns = Array.from({ length: 1000 }, (_, i) => ({ ...value.patterns[0], id: `p-${i}` }));
    expect(parseBackup(serializeBackup(value))).toEqual(value);
    value.history.entries.push({ ...value.history.entries[0], id: 'over-history' });
    expect(() => parseBackup(JSON.stringify(value))).toThrow();
    value.history.entries.pop();
    value.patterns.push({ ...value.patterns[0], id: 'over-patterns' });
    expect(() => parseBackup(JSON.stringify(value))).toThrow();
  });

  it('rejects malformed JSON, missing sections, and sparse record arrays', () => {
    expect(() => parseBackup('{bad json')).toThrow();
    expect(() => parseBackup('{}')).toThrow();
    const value = emptyBrowserData();
    value.history.entries = new Array(1);
    expect(validateBrowserData(value)).toBe(false);
  });
});

describe('IndexedDB browser store', () => {
  it('retains history, learning, and cursors after closing and reopening', async () => {
    const first = await open();
    expect(first.persistent).toBe(true);
    expect(await first.read()).toEqual(emptyBrowserData());
    await first.replace(populated());
    first.close();
    expect(await (await open()).read()).toEqual(populated());
  });

  it('serializes updates from independent tabs without losing changes', async () => {
    const tabs = await Promise.all([open(), open(), open()]);
    await Promise.all(Array.from({ length: 24 }, (_, i) => tabs[i % tabs.length].update(current => {
      current.lastCandle.BTC += 1;
      return current;
    })));
    expect((await tabs[0].read()).lastCandle.BTC).toBe(24);
  });

  it('keeps old data when a mutator throws or returns malformed data', async () => {
    const store = await open();
    await store.replace(populated());
    await expect(store.update(current => { current.history.entries = []; throw new Error('mutator failed'); })).rejects.toThrow('mutator failed');
    await expect(store.update(current => ({ ...current, version: 2 } as never))).rejects.toThrow();
    expect(await store.read()).toEqual(populated());
  });

  it('rejects an aborted write even after put success and preserves old data', async () => {
    const store = await open();
    await store.replace(populated());
    const originalPut = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      const request = originalPut.apply(this, args);
      request.addEventListener('success', () => this.transaction.abort());
      return request;
    });
    await expect(store.update(current => { current.lastCandle.BTC += 1; return current; })).rejects.toThrow();
    spy.mockRestore();
    expect(await store.read()).toEqual(populated());
  });

  it('does not hide failed writes or switch the persistent store to memory', async () => {
    const store = await open();
    await store.replace(populated());
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => { throw new DOMException('Storage is full', 'QuotaExceededError'); });
    await expect(store.update(current => { current.patterns = []; return current; })).rejects.toThrow('Storage is full');
    expect(store.persistent).toBe(true);
    spy.mockRestore();
    expect(await store.read()).toEqual(populated());
  });

  it('preserves malformed saved data until an explicit validated replacement', async () => {
    const store = await open();
    const originalPut = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, _value: unknown, key?: IDBValidKey) {
      return originalPut.call(this, { version: 999, doNotLose: 'recoverable' }, key);
    });
    await store.replace(populated());
    spy.mockRestore();
    await expect(store.read()).rejects.toThrow();
    const mutation = vi.fn(current => current);
    await expect(store.update(mutation)).rejects.toThrow();
    expect(mutation).not.toHaveBeenCalled();
    await expect(store.read()).rejects.toThrow();
    await store.replace(populated());
    expect(await store.read()).toEqual(populated());
  });

  it('treats a stored undefined row as corruption, not a new database', async () => {
    const store = await open();
    const originalPut = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, _value: unknown, key?: IDBValidKey) {
      return originalPut.call(this, undefined, key);
    });
    await store.replace(populated());
    spy.mockRestore();
    await expect(store.read()).rejects.toThrow();
    await expect(store.update(current => current)).rejects.toThrow();
  });

  it('returns detached snapshots and rejects access after close', async () => {
    const store = await open();
    const input = populated();
    const saved = await store.replace(input);
    input.history.entries[0].entryPrice = 999;
    saved.lastCandle.BTC = 999;
    const read = await store.read();
    read.history.entries.length = 0;
    expect(await store.read()).toEqual(populated());
    store.close();
    await expect(store.read()).rejects.toThrow();
  });

  it('surfaces unavailable IndexedDB and allows only an explicit temporary store', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await expect(openBrowserStore()).rejects.toThrow();
    const memory = createMemoryBrowserStore();
    expect(memory.persistent).toBe(false);
    await memory.replace(populated());
    expect(await memory.read()).toEqual(populated());
    await expect(memory.update(current => { current.patterns = []; throw new Error('failed'); })).rejects.toThrow('failed');
    expect(await memory.read()).toEqual(populated());
    expect(await createMemoryBrowserStore().read()).toEqual(emptyBrowserData());
    memory.close();
    await expect(memory.read()).rejects.toThrow();
  });
});
