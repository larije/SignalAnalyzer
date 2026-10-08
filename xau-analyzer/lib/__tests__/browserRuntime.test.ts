import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrowserRuntime, type BrowserRuntimeDependencies, type BrowserRuntimeSnapshot } from '../browserRuntime';
import { BROWSER_INTERVAL_MS } from '../browserMarket';
import { emptyBrowserData, type BrowserData, type BrowserStore } from '../browserStorage';
import { SignalHistoryStore } from '../signalHistoryCore';
import { PatternDatabaseStore, type TradeFeatures } from '../patternDatabaseCore';
import type { LiveSignalResult } from '../signalAnalysis';
import type { Candle } from '../technicalAnalysis';

const MINUTE = 60_000;
const NOW = Date.UTC(2026, 9, 9, 10, 0, 10);
const LATEST = Math.floor(NOW / MINUTE) * MINUTE;
const features: TradeFeatures = {
  pattern: 'BULL_FLAG', patternConfidence: 80, patternDirection: 'BULLISH', regime: 'TRENDING', regimeDirection: 'BULLISH',
  mtfAlignment: 80, dominantBias: 'BULLISH', structureType: 'STRONG_UPTREND', volumeConfirmation: 'BULL',
  session: 'LONDON', signalType: 'BUY', score: 40, confidence: 70, rr: 2,
  componentScores: { rsi: 10, macd: 10, bb: 5, ema: 7, stoch: 5, volume: 5, structure: 10, mtf: 15 },
};
const candle = (time: number, patch: Partial<Candle> = {}): Candle => ({ time, open: 100, high: 101, low: 99, close: 100, volume: 10, ...patch });

function storeWith(initial = emptyBrowserData()) {
  let data = structuredClone(initial);
  let queue: Promise<unknown> = Promise.resolve();
  const store: BrowserStore = {
    persistent: true,
    read: vi.fn(async () => structuredClone(data)),
    update: vi.fn(mutator => {
      const update = queue.then(() => {
        const next = mutator(structuredClone(data));
        data = structuredClone(next);
        return structuredClone(data);
      });
      queue = update.catch(() => undefined);
      return update;
    }),
    replace: async value => { data = structuredClone(value); return structuredClone(data); },
    close: vi.fn(),
  };
  return store;
}

function pendingAt(timestamp: number): BrowserData {
  const history = new SignalHistoryStore();
  const patterns = new PatternDatabaseStore();
  history.record('BTC', 'BUY', 40, 70, 100, 98, 104, timestamp, 'original');
  patterns.record('original', 'BTC', features, 100, 98, 104, timestamp);
  return { version: 1, history: history.exportSnapshot(), patterns: patterns.exportSnapshot(), lastCandle: { BTC: 0, XAU: 0 } };
}

function dependencies(overrides: BrowserRuntimeDependencies = {}) {
  const fetchCandles = vi.fn<NonNullable<BrowserRuntimeDependencies['fetchCandles']>>(async (_symbol, interval, limit, _signal, start, end) => {
    const step = BROWSER_INTERVAL_MS[interval];
    if (start !== undefined && end !== undefined) {
      return Array.from({ length: Math.floor((end - start) / step) + 1 }, (_, i) => candle(start + i * step));
    }
    const forming = Math.floor(NOW / step) * step;
    return Array.from({ length: limit }, (_, index) => candle(forming - (limit - index - 1) * step));
  });
  const fetchTicker = vi.fn<NonNullable<BrowserRuntimeDependencies['fetchTicker']>>(async symbol => ({ symbol, price: 100, open: 100, high: 101, low: 99, volume: 10, change: 0, changePercent: 0, timestamp: NOW }));
  const compute = vi.fn<NonNullable<BrowserRuntimeDependencies['compute']>>((input, history, patterns, record) => {
    const entry = input.candles[input.candles.length - 2];
    const timestamp = entry.time + MINUTE;
    if (record) {
      history.record(input.asset, 'BUY', 40, 70, 100, 98, 104, timestamp, `${input.asset}-${timestamp}`);
      patterns.record(`${input.asset}-${timestamp}`, input.asset, features, 100, 98, 104, timestamp);
    }
    return { asset: input.asset, signalCandleTime: timestamp, stale: NOW - timestamp > 90_000, signal: { signal: 'BUY' }, enhanced: {}, indicators: {} } as LiveSignalResult;
  });
  return { fetchCandles, fetchTicker, compute, now: () => NOW, visibilityTarget: null, ...overrides };
}

const running: ReturnType<typeof createBrowserRuntime>[] = [];
function setup(store = storeWith(), deps: BrowserRuntimeDependencies = dependencies()) {
  const updates: BrowserRuntimeSnapshot[] = [];
  const runtime = createBrowserRuntime(store, snapshot => updates.push(snapshot), deps);
  running.push(runtime);
  runtime.start();
  return { runtime, store, updates };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { running.splice(0).forEach(runtime => runtime.stop()); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('browser market runtime', () => {
  it('hydrates before fetching, preserving local history even when the network fails', async () => {
    const initial = pendingAt(LATEST - MINUTE);
    const store = storeWith(initial);
    let hydrate!: (value: BrowserData) => void;
    vi.mocked(store.read).mockImplementationOnce(() => new Promise(resolve => { hydrate = resolve; }));
    const deps = dependencies({ fetchCandles: vi.fn().mockRejectedValue(new Error('Offline')) });
    const { runtime, updates } = setup(store, deps);
    expect(updates).toHaveLength(0);
    expect(deps.fetchCandles).not.toHaveBeenCalled();
    hydrate(initial);
    await runtime.refresh();
    expect(updates[0].data.history.entries[0].id).toBe('original');
    expect(updates.at(-1)?.error).toBe('Offline');
    expect(store.update).not.toHaveBeenCalled();
  });

  it('records only once for a closed candle across reloads and concurrent tabs', async () => {
    const store = storeWith();
    const deps = dependencies();
    const first = setup(store, deps);
    const second = setup(store, deps);
    await Promise.all([first.runtime.refresh(), second.runtime.refresh()]);
    expect((await store.read()).history.entries).toHaveLength(2);
    expect(vi.mocked(deps.compute).mock.calls.filter(call => call[3])).toHaveLength(2);
    first.runtime.stop(); second.runtime.stop();
    const data = await store.read();
    data.history.entries.forEach(entry => { entry.outcome = 'WIN'; });
    data.patterns.forEach(entry => { entry.outcome = 'WIN'; });
    await store.replace(data);
    const reloaded = setup(store, deps);
    await reloaded.runtime.refresh();
    expect((await store.read()).history.entries).toHaveLength(2);
    expect(vi.mocked(deps.compute).mock.calls.filter(call => call[3])).toHaveLength(2);
  });

  it('recovers missing bars chronologically and books the first touch using candle close time', async () => {
    const entryTime = LATEST - 400 * MINUTE;
    const deps = dependencies();
    const originalFetch = deps.fetchCandles;
    deps.fetchCandles = vi.fn<NonNullable<BrowserRuntimeDependencies['fetchCandles']>>(async (...args) => {
      const rows = await originalFetch(...args);
      return args[4] === undefined ? rows : rows.map((bar, index) => ({ ...bar, high: index === 0 ? 105 : 101, low: index === 1 ? 97 : 99 }));
    });
    const { runtime, store, updates } = setup(storeWith(pendingAt(entryTime)), deps);
    await runtime.refresh();
    expect(updates.at(-1)?.error).toBeNull();
    const data = await store.read();
    const old = data.history.entries.find(entry => entry.id === 'original');
    expect(old).toMatchObject({ outcome: 'WIN', exitPrice: 104, holdMinutes: 1 });
    expect(data.patterns.find(entry => entry.id === 'original')).toMatchObject({ outcome: 'WIN', holdMinutes: 1 });
    const backfills = vi.mocked(deps.fetchCandles).mock.calls.filter(call => call[4] !== undefined);
    expect(backfills).toHaveLength(1);
    expect(backfills[0].slice(4)).toEqual([entryTime, entryTime + 60 * MINUTE - 1]);
    expect(vi.mocked(deps.compute).mock.calls).toHaveLength(2);
    expect(data.lastCandle).toEqual({ BTC: LATEST, XAU: LATEST });
  });

  it('leaves both ledgers and cursors untouched when a recovery candle is missing', async () => {
    const initial = pendingAt(LATEST - 400 * MINUTE);
    const deps = dependencies();
    const originalFetch = deps.fetchCandles;
    deps.fetchCandles = vi.fn<NonNullable<BrowserRuntimeDependencies['fetchCandles']>>(async (...args) => {
      const rows = await originalFetch(...args);
      return args[4] === undefined ? rows : rows.slice(1);
    });
    const { runtime, store, updates } = setup(storeWith(initial), deps);
    await runtime.refresh();
    expect(updates.at(-1)?.error).toContain('recovery candles are incomplete');
    expect(await store.read()).toEqual(initial);
    expect(store.update).not.toHaveBeenCalled();
  });

  it('does not resolve imported entries against a bar that opened before entry', async () => {
    const entryTime = LATEST - 3 * MINUTE + 30_000;
    const deps = dependencies();
    const originalFetch = deps.fetchCandles;
    deps.fetchCandles = vi.fn<NonNullable<BrowserRuntimeDependencies['fetchCandles']>>(async (...args) => (await originalFetch(...args)).map(bar => ({
      ...bar, high: bar.time === LATEST - 3 * MINUTE ? 105 : 101,
      low: bar.time === LATEST - 2 * MINUTE ? 97 : 99,
    })));
    const { runtime, store } = setup(storeWith(pendingAt(entryTime)), deps);
    await runtime.refresh();
    expect((await store.read()).history.entries.find(entry => entry.id === 'original')).toMatchObject({ outcome: 'LOSS', holdMinutes: 1.5 });
  });

  it('times out at the original 60-minute deadline before a later target touch', async () => {
    const entryTime = LATEST - 80 * MINUTE;
    const deps = dependencies();
    const originalFetch = deps.fetchCandles;
    deps.fetchCandles = vi.fn<NonNullable<BrowserRuntimeDependencies['fetchCandles']>>(async (...args) => (await originalFetch(...args)).map(bar => ({
      ...bar, high: bar.time >= entryTime + 65 * MINUTE ? 105 : 101,
    })));
    const { runtime, store } = setup(storeWith(pendingAt(entryTime)), deps);
    await runtime.refresh();
    expect((await store.read()).history.entries.find(entry => entry.id === 'original')).toMatchObject({ outcome: 'TIMEOUT', holdMinutes: 60, exitPrice: 100 });
  });

  it('rechecks recovery coverage inside the transaction when another tab changed history', async () => {
    const initial = pendingAt(LATEST - 400 * MINUTE);
    const store = storeWith(initial);
    vi.mocked(store.read).mockResolvedValueOnce(emptyBrowserData());
    const { runtime, updates } = setup(store);
    await runtime.refresh();
    expect(updates.at(-1)?.error).toContain('recovery candles are incomplete');
    expect(await store.read()).toEqual(initial);
  });

  it('does not write an incomplete higher-timeframe analysis', async () => {
    const deps = dependencies();
    const originalFetch = deps.fetchCandles;
    deps.fetchCandles = vi.fn<NonNullable<BrowserRuntimeDependencies['fetchCandles']>>(async (...args) => {
      const rows = await originalFetch(...args);
      return args[1] === '4h' ? rows.slice(0, 5) : rows;
    });
    const { runtime, store, updates } = setup(storeWith(), deps);
    await runtime.refresh();
    expect(updates.at(-1)?.error).toContain('4h market candles are incomplete');
    expect(store.update).not.toHaveBeenCalled();
    expect(deps.compute).not.toHaveBeenCalled();
  });

  it('aborts sibling requests when one market request fails', async () => {
    let siblingSignal: AbortSignal | undefined;
    const deps = dependencies({ fetchCandles: vi.fn<NonNullable<BrowserRuntimeDependencies['fetchCandles']>>(async (symbol, _interval, _limit, signal) => {
      if (symbol === 'BTCUSDT') throw new Error('Request failed');
      siblingSignal = signal;
      return new Promise<Candle[]>((_resolve, reject) => signal?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true }));
    }) });
    const { runtime, updates, store } = setup(storeWith(), deps);
    await runtime.refresh();
    expect(siblingSignal?.aborted).toBe(true);
    expect(updates.at(-1)?.error).toBe('Request failed');
    expect(store.update).not.toHaveBeenCalled();
  });

  it('never resolves or records from stale data', async () => {
    const initial = pendingAt(LATEST - 4 * MINUTE);
    const deps = dependencies();
    const originalFetch = deps.fetchCandles;
    deps.fetchCandles = vi.fn<NonNullable<BrowserRuntimeDependencies['fetchCandles']>>(async (...args) => (await originalFetch(...args)).map(bar => ({ ...bar, time: bar.time - 3 * MINUTE })));
    const { runtime, store, updates } = setup(storeWith(initial), deps);
    await runtime.refresh();
    expect(store.update).not.toHaveBeenCalled();
    expect(await store.read()).toEqual(initial);
    expect(vi.mocked(deps.compute).mock.calls.every(call => call[3] === false)).toBe(true);
    expect(updates.at(-1)).toMatchObject({ connected: false, btc: { stale: true }, xau: { stale: true } });
  });

  it('caches multi-timeframe analysis and freezes signals between closed candles', async () => {
    const deps = dependencies();
    const { runtime, updates } = setup(storeWith(), deps);
    await runtime.refresh();
    await runtime.refresh();
    expect(vi.mocked(deps.fetchCandles).mock.calls.filter(call => call[1] !== '1m')).toHaveLength(8);
    expect(deps.compute).toHaveBeenCalledTimes(2);
    expect(updates.at(-1)?.loading).toBe(false);
    const last = updates.at(-1)!;
    last.data.history.entries.length = 0;
    await runtime.refresh();
    expect(updates.at(-1)?.data.history.entries).toHaveLength(2);
  });

  it('coalesces overlapping refreshes and aborts work and listeners on stop', async () => {
    let signal: AbortSignal | undefined;
    const visibility = { visibilityState: 'visible', addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const deps = dependencies({ visibilityTarget: visibility, fetchCandles: vi.fn<NonNullable<BrowserRuntimeDependencies['fetchCandles']>>((_s, _i, _l, nextSignal) => {
      signal = nextSignal;
      return new Promise<Candle[]>((_resolve, reject) => nextSignal?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true }));
    }) });
    const { runtime, store, updates } = setup(storeWith(), deps);
    await Promise.resolve(); await Promise.resolve();
    const one = runtime.refresh();
    expect(runtime.refresh()).toBe(one);
    runtime.stop();
    expect(signal?.aborted).toBe(true);
    expect(visibility.removeEventListener).toHaveBeenCalledWith('visibilitychange', visibility.addEventListener.mock.calls[0][1]);
    await one;
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(store.update).not.toHaveBeenCalled();
    expect(updates).toHaveLength(1);
    expect(deps.fetchCandles).toHaveBeenCalledTimes(2);
  });
});
