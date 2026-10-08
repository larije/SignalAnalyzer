import type { Candle, Indicators } from './technicalAnalysis';
import type { TickerData } from './binanceService';
import type { TradingSignal } from './signalEngine';
import type { LiveSignalResult } from './signalAnalysis';
import { computeBrowserSignal } from './signalAnalysis';
import { SignalHistoryStore } from './signalHistoryCore';
import { PatternDatabaseStore } from './patternDatabaseCore';
import { emptyBrowserData, type BrowserData, type BrowserStore } from './browserStorage';
import { BROWSER_INTERVAL_MS, fetchBrowserCandles, fetchBrowserTicker } from './browserMarket';
import { mtfFromTimeframes } from './multiTimeframe';
import { RESOLVE_TIMEOUT_MIN } from './tradeLifecycle';
import type { MultiTimeframeAnalysis } from './types';

type Asset = 'BTC' | 'XAU';
const ASSETS: Asset[] = ['BTC', 'XAU'];
const SYMBOLS: Record<Asset, string> = { BTC: 'BTCUSDT', XAU: 'PAXGUSDT' };
const MINUTE = 60_000;
const STALE_MS = 90_000;
const TIMEFRAMES = [['5m', '5 Minute', 100], ['15m', '15 Minute', 100], ['1h', '1 Hour', 100], ['4h', '4 Hour', 60]] as const;

export interface BrowserAssetState {
  ticker: TickerData | null;
  candles: Candle[];
  signal: TradingSignal | null;
  enhanced: LiveSignalResult['enhanced'] | null;
  indicators: Indicators | null;
  signalCandleTime?: number;
  stale: boolean;
}

export interface BrowserRuntimeSnapshot {
  btc: BrowserAssetState;
  xau: BrowserAssetState;
  connected: boolean;
  loading: boolean;
  error: string | null;
  data: BrowserData;
}

interface VisibilityTarget {
  readonly visibilityState: string;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

/** Dependencies keep the runtime testable without network, React or a browser tab. */
export interface BrowserRuntimeDependencies {
  fetchCandles?: typeof fetchBrowserCandles;
  fetchTicker?: typeof fetchBrowserTicker;
  compute?: typeof computeBrowserSignal;
  now?: () => number;
  pollMs?: number;
  visibilityTarget?: VisibilityTarget | null;
}

const emptyAsset = (): BrowserAssetState => ({ ticker: null, candles: [], signal: null, enhanced: null, indicators: null, stale: true });
const clone = <T,>(value: T): T => structuredClone(value);
const closed = (candles: Candle[], now: number, interval = MINUTE) => candles.filter(candle => candle.time + interval <= now);
const closeTime = (candles: Candle[]) => candles.length ? candles[candles.length - 1].time + MINUTE : 0;

// Signal analysis accepts a forming final bar for parity with the original live
// engine. Only this private adapter adds a sentinel; it never reaches the UI or
// any calculation (analysis drops it before calculating indicators/correlation).
function analysisInput(candles: Candle[]): Candle[] {
  const last = candles[candles.length - 1];
  return last ? [...candles, { ...last, time: last.time + MINUTE }] : [];
}

interface ReplayRange { start: number; end: number }
function replayRanges(data: BrowserData, asset: Asset, latestClose: number): ReplayRange[] {
  const pending = [...data.history.entries, ...data.patterns]
    .filter(trade => trade.asset === asset && trade.outcome === 'PENDING');
  const ranges = pending.map(trade => ({
    start: Math.max(Math.ceil(trade.timestamp / MINUTE) * MINUTE, data.lastCandle[asset]),
    end: Math.min(latestClose, Math.ceil((trade.timestamp + RESOLVE_TIMEOUT_MIN * MINUTE) / MINUTE) * MINUTE) - MINUTE,
  })).filter(range => range.start <= range.end).sort((a, b) => a.start - b.start);
  const merged: ReplayRange[] = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end + MINUTE) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

function completeRange(candles: Map<number, Candle>, range: ReplayRange): boolean {
  for (let time = range.start; time <= range.end; time += MINUTE) if (!candles.has(time)) return false;
  return true;
}

function replayPending(
  data: BrowserData, asset: Asset, latestClose: number, available: Map<number, Candle>,
  history: SignalHistoryStore, patterns: PatternDatabaseStore,
): void {
  const ranges = replayRanges(data, asset, latestClose);
  // Validate all expected bars before changing either ledger. One missing bar
  // could hide a stop or target touch and must never become a fabricated result.
  if (ranges.some(range => !completeRange(available, range))) throw new Error(`${asset} recovery candles are incomplete. Pending trades are unchanged.`);
  for (const range of ranges) {
    for (let time = range.start; time <= range.end; time += MINUTE) {
      const candle = available.get(time)!;
      history.resolvePending(asset, candle, time + MINUTE, true);
      patterns.resolvePending(asset, candle, time + MINUTE, true);
    }
  }
}

export function createBrowserRuntime(
  store: BrowserStore,
  onUpdate: (snapshot: BrowserRuntimeSnapshot) => void,
  dependencies: BrowserRuntimeDependencies = {},
): { start(): void; stop(): void; refresh(): Promise<void> } {
  const fetchCandles = dependencies.fetchCandles ?? fetchBrowserCandles;
  const fetchTicker = dependencies.fetchTicker ?? fetchBrowserTicker;
  const compute = dependencies.compute ?? computeBrowserSignal;
  const now = dependencies.now ?? Date.now;
  const visibility = dependencies.visibilityTarget === undefined
    ? (typeof document === 'undefined' ? null : document) : dependencies.visibilityTarget;
  let active = false;
  let generation = 0;
  let hydrated = false;
  let pending: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let requestTimer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;
  let snapshot: BrowserRuntimeSnapshot = { btc: emptyAsset(), xau: emptyAsset(), connected: false, loading: true, error: null, data: emptyBrowserData() };
  const mtfCache = new Map<Asset, { close: number; analysis: MultiTimeframeAnalysis }>();

  function publish() {
    if (active) onUpdate(clone(snapshot));
  }

  function schedule() {
    if (!active || timer) return;
    timer = setTimeout(() => {
      timer = null;
      void refresh();
    }, dependencies.pollMs ?? 15_000);
  }

  async function update(run: number): Promise<void> {
    const abort = new AbortController();
    controller = abort;
    const timeout = setTimeout(() => abort.abort(), 20_000);
    requestTimer = timeout;
    const live = () => active && generation === run && !abort.signal.aborted;
    const ensureLive = () => { if (!live()) throw new Error('Market refresh cancelled.'); };
    try {
      const data = await store.read();
      ensureLive();
      snapshot.data = data;
      if (!hydrated) {
        hydrated = true;
        publish();
      }
      const feeds = await Promise.all(ASSETS.map(async asset => {
        const [candles, ticker] = await Promise.all([
          fetchCandles(SYMBOLS[asset], '1m', 300, abort.signal),
          fetchTicker(SYMBOLS[asset], abort.signal),
        ]);
        return { asset, candles, ticker };
      }));
      ensureLive();
      const currentTime = now();
      const bases = { BTC: closed(feeds[0].candles, currentTime), XAU: closed(feeds[1].candles, currentTime) };
      for (const asset of ASSETS) {
        const candles = bases[asset];
        if (candles.length < 55 || candles.some((candle, index) => index > 0 && candle.time !== candles[index - 1].time + MINUTE)) {
          throw new Error(`${asset} market candles are incomplete. Please retry.`);
        }
      }
      const fresh = Object.fromEntries(ASSETS.map(asset => [asset, currentTime - closeTime(bases[asset]) <= STALE_MS])) as Record<Asset, boolean>;
      const recovery: Record<Asset, Map<number, Candle>> = { BTC: new Map(), XAU: new Map() };
      const mtf = {} as Record<Asset, MultiTimeframeAnalysis>;
      await Promise.all(ASSETS.map(async asset => {
        const latestClose = closeTime(bases[asset]);
        recovery[asset] = new Map(bases[asset].map(candle => [candle.time, candle]));
        if (fresh[asset]) {
          for (const range of replayRanges(data, asset, latestClose)) {
            if (completeRange(recovery[asset], range)) continue;
            const rows = await fetchCandles(SYMBOLS[asset], '1m', Math.min(1000, (range.end - range.start) / MINUTE + 1), abort.signal, range.start, range.end + MINUTE - 1);
            ensureLive();
            rows.forEach(candle => { if (candle.time + MINUTE <= currentTime) recovery[asset].set(candle.time, candle); });
            if (!completeRange(recovery[asset], range)) throw new Error(`${asset} recovery candles are incomplete. Pending trades are unchanged.`);
          }
        }
        const cached = mtfCache.get(asset);
        if (cached?.close === latestClose) { mtf[asset] = cached.analysis; return; }
        const frames = await Promise.all(TIMEFRAMES.map(async ([interval, label, limit]) => {
          const rows = await fetchCandles(SYMBOLS[asset], interval, limit, abort.signal);
          const intervalMs = BROWSER_INTERVAL_MS[interval];
          const candles = closed(rows, currentTime, intervalMs);
          if (candles.length < 55 || candles.some((candle, index) => index > 0 && candle.time !== candles[index - 1].time + intervalMs)) {
            throw new Error(`${asset} ${interval} market candles are incomplete. Please retry.`);
          }
          return [candles, interval, label] as [Candle[], string, string];
        }));
        ensureLive();
        mtf[asset] = mtfFromTimeframes([[bases[asset], '1m', '1 Minute'], ...frames]);
        mtfCache.set(asset, { close: latestClose, analysis: mtf[asset] });
      }));
      ensureLive();
      const results: Partial<Record<Asset, LiveSignalResult | null>> = {};
      const calculate = (current: BrowserData, write: boolean) => {
        ensureLive();
        const history = new SignalHistoryStore(current.history);
        const patterns = new PatternDatabaseStore(current.patterns);
        for (const asset of ASSETS) {
          const latestClose = closeTime(bases[asset]);
          const isNew = fresh[asset] && latestClose > current.lastCandle[asset];
          if (write && isNew) replayPending(current, asset, latestClose, recovery[asset], history, patterns);
          const previous = asset === 'BTC' ? snapshot.btc : snapshot.xau;
          if (!isNew && previous.signalCandleTime === latestClose && previous.signal && previous.enhanced && previous.indicators) {
            results[asset] = null; // Keep an already displayed closed-candle signal frozen.
          } else {
            results[asset] = compute({
              asset, candles: analysisInput(bases[asset]), btcCandles: analysisInput(bases.BTC),
              xauCandles: analysisInput(bases.XAU), ticker: feeds.find(feed => feed.asset === asset)!.ticker,
              mtf: mtf[asset], now: currentTime,
            }, history, patterns, write && isNew);
            if (!results[asset]) throw new Error(`${asset} signal analysis is unavailable. Please retry.`);
          }
          if (write && isNew) current.lastCandle[asset] = latestClose;
        }
        if (write) {
          current.history = history.exportSnapshot();
          current.patterns = patterns.exportSnapshot();
        }
        return current;
      };
      // Even when this tab is up to date, the transaction reloads the latest
      // cross-tab state before resolving/recording. No network runs inside it.
      const nextData = fresh.BTC || fresh.XAU
        ? await store.update(current => calculate(current, true))
        : calculate(data, false);
      ensureLive();
      for (const feed of feeds) {
        const key = feed.asset === 'BTC' ? 'btc' : 'xau';
        const result = results[feed.asset];
        snapshot[key] = {
          ...snapshot[key], ticker: feed.ticker, candles: feed.candles,
          ...(result ? { signal: result.signal, enhanced: result.enhanced, indicators: result.indicators, signalCandleTime: result.signalCandleTime } : {}),
          stale: !fresh[feed.asset],
        };
      }
      snapshot.data = nextData;
      snapshot.loading = false;
      snapshot.connected = fresh.BTC && fresh.XAU;
      snapshot.error = snapshot.connected ? null : 'Market candles are delayed. History updates are paused for stale assets.';
      publish();
    } catch (error) {
      if (!active || generation !== run) return;
      snapshot.connected = false;
      snapshot.loading = false;
      snapshot.btc.stale = true;
      snapshot.xau.stale = true;
      snapshot.error = abort.signal.aborted ? 'Market data request timed out. Retrying automatically.'
        : error instanceof Error ? error.message : 'Market data is unavailable. Retrying automatically.';
      publish();
    } finally {
      // Promise.all may reject while sibling requests are still running.
      // Abort them before dropping this refresh's controller and deadline.
      abort.abort();
      clearTimeout(timeout);
      if (requestTimer === timeout) requestTimer = null;
      if (controller === abort) controller = null;
    }
  }

  function refresh(): Promise<void> {
    if (!active) return Promise.resolve();
    if (pending) return pending;
    if (timer) { clearTimeout(timer); timer = null; }
    const run = generation;
    pending = update(run).finally(() => {
      pending = null;
      if (active && generation === run) schedule();
      else if (active) void refresh();
    });
    return pending;
  }

  const resume = () => { if (visibility?.visibilityState === 'visible') void refresh(); };
  return {
    start() {
      if (active) return;
      active = true;
      generation += 1;
      visibility?.addEventListener('visibilitychange', resume);
      void refresh();
    },
    stop() {
      active = false;
      generation += 1;
      controller?.abort();
      if (timer) clearTimeout(timer);
      if (requestTimer) clearTimeout(requestTimer);
      timer = null;
      requestTimer = null;
      visibility?.removeEventListener('visibilitychange', resume);
    },
    refresh,
  };
}
