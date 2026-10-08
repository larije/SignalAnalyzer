import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Candle } from '../technicalAnalysis';

const feed = vi.hoisted(() => ({ btc: [] as Candle[], xau: [] as Candle[] }));
vi.mock('../binanceService', () => ({ binanceService: {
  getCandles: (symbol: string) => symbol === 'BTCUSDT' ? feed.btc : feed.xau,
  getTicker: (symbol: string) => ({ symbol, price: 143, open: 100, high: 144, low: 99, volume: 1000, change: 43, changePercent: 43, timestamp: Date.now() }),
} }));
vi.mock('../signalHistory', async () => {
  const actual = await vi.importActual<typeof import('../signalHistory')>('../signalHistory');
  return { ...actual, signalHistory: new actual.SignalHistoryStore() };
});
vi.mock('../patternDatabase', async () => {
  const actual = await vi.importActual<typeof import('../patternDatabase')>('../patternDatabase');
  return { ...actual, patternDatabase: new actual.PatternDatabaseStore() };
});
vi.mock('../multiTimeframe', async () => {
  const actual = await vi.importActual<typeof import('../multiTimeframe')>('../multiTimeframe');
  return { ...actual, fetchMultiTimeframeAnalysis: async () => actual.mtfFromTimeframes([
    [feed.btc.slice(0, -1), '1m', '1 Minute'], [feed.btc.slice(0, -1), '5m', '5 Minute'],
    [feed.btc.slice(0, -1), '15m', '15 Minute'], [feed.btc.slice(0, -1), '1h', '1 Hour'],
    [feed.btc.slice(0, -1), '4h', '4 Hour'],
  ]) };
});

import { computeSignalForAsset } from '../liveSignal';
import { computeBrowserSignal, type BrowserSignalInput } from '../signalAnalysis';
import { SignalHistoryStore } from '../signalHistoryCore';
import { PatternDatabaseStore } from '../patternDatabaseCore';
import { fetchMultiTimeframeAnalysis } from '../multiTimeframe';
import { binanceService } from '../binanceService';
import * as signalEngine from '../signalEngine';

async function input(): Promise<BrowserSignalInput> {
  return {
    asset: 'BTC', candles: feed.btc, btcCandles: feed.btc, xauCandles: feed.xau,
    ticker: binanceService.getTicker('BTCUSDT'),
    mtf: await fetchMultiTimeframeAnalysis('BTCUSDT', feed.btc.slice(0, -1)), now: Date.now(),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-09T09:10:10Z'));
  const formingTime = Math.floor(Date.now() / 60_000) * 60_000;
  feed.btc = Array.from({ length: 240 }, (_, i) => {
    const close = 100 + i * 0.18 + Math.sin(i / 7) * 1.2;
    return { time: formingTime - (239 - i) * 60_000, open: close - 0.1, high: close + 0.5, low: close - 0.5, close, volume: 100 + i % 11 };
  });
  feed.xau = feed.btc.map(candle => ({ ...candle, open: candle.open * 20, high: candle.high * 20, low: candle.low * 20, close: candle.close * 20 }));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('live analysis extraction', () => {
  it('preserves the existing server numerical result for fixed candles and time', async () => {
    const result = await computeSignalForAsset('BTC');
    expect(result).not.toBeNull();
    expect(result).toMatchSnapshot();
  });

  it('matches the server pipeline without network, persistence or resolution side effects', async () => {
    const history = new SignalHistoryStore();
    const patterns = new PatternDatabaseStore();
    const resolveHistory = vi.spyOn(history, 'resolvePending');
    const resolvePatterns = vi.spyOn(patterns, 'resolvePending');
    const browser = computeBrowserSignal(await input(), history, patterns, false);
    expect(browser).toEqual(await computeSignalForAsset('BTC'));
    expect(history.exportSnapshot().entries).toEqual([]);
    expect(patterns.exportSnapshot()).toEqual([]);
    expect(resolveHistory).not.toHaveBeenCalled();
    expect(resolvePatterns).not.toHaveBeenCalled();
  });

  it('records both ledgers once at the frozen close time with the same stable id', async () => {
    const history = new SignalHistoryStore();
    const patterns = new PatternDatabaseStore();
    const data = await input();
    const realResult = computeBrowserSignal(data, history, patterns, false)!;
    vi.spyOn(signalEngine, 'generateEnhancedSignal').mockReturnValue({ ...realResult.enhanced, signal: 'BUY' });
    const result = computeBrowserSignal(data, history, patterns, true)!;
    computeBrowserSignal(data, history, patterns, true);
    expect(history.getHistory('BTC')).toHaveLength(1);
    expect(patterns.getHistory('BTC')).toHaveLength(1);
    const expectedId = `BTC-${result.signalCandleTime}-BUY`;
    expect(history.getHistory('BTC')[0]).toMatchObject({ id: expectedId, timestamp: result.signalCandleTime, outcome: 'PENDING' });
    expect(patterns.getHistory('BTC')[0]).toMatchObject({ id: expectedId, timestamp: result.signalCandleTime, outcome: 'PENDING' });
  });

  it('does not record stale data or change a signal when only the forming candle changes', async () => {
    const history = new SignalHistoryStore();
    const patterns = new PatternDatabaseStore();
    const data = await input();
    const original = computeBrowserSignal(data, history, patterns, false)!;
    vi.spyOn(signalEngine, 'generateEnhancedSignal').mockReturnValue({ ...original.enhanced, signal: 'BUY' });
    const stale = computeBrowserSignal({ ...data, now: data.now + 100_000 }, history, patterns, true)!;
    expect(stale.stale).toBe(true);
    expect(history.getHistory()).toEqual([]);
    expect(patterns.getHistory()).toEqual([]);
    vi.restoreAllMocks();
    const formingChanged = data.candles.map((candle, i) => i === data.candles.length - 1 ? { ...candle, close: 999999, high: 999999 } : candle);
    expect(computeBrowserSignal({ ...data, candles: formingChanged }, history, patterns, false)).toEqual(original);
  });
});
