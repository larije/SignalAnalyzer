// Server compatibility wrapper around the browser-safe numerical pipeline.
import { binanceService } from './binanceService';
import { calculateIndicators } from './technicalAnalysis';
import { fetchMultiTimeframeAnalysis } from './multiTimeframe';
import { patternDatabase } from './patternDatabase';
import { signalHistory } from './signalHistory';
import { closedCandles, lastClosedCandle, closeTimeOf, isStale, computeBrowserSignal, type LiveSignalResult } from './signalAnalysis';
export { STALE_MS, CANDLE_INTERVAL_MS, closeTimeOf, lastClosedCandle, closedCandles, isStale, shouldRecordSignal } from './signalAnalysis';
export type { LiveSignalResult } from './signalAnalysis';

export async function computeSignalForAsset(asset: 'BTC' | 'XAU'): Promise<LiveSignalResult | null> {
  const symbol = asset === 'BTC' ? 'BTCUSDT' : 'PAXGUSDT';
  const candles = binanceService.getCandles(symbol).slice();
  const closed = closedCandles(candles);
  const lastClosed = lastClosedCandle(candles);
  if (!lastClosed || !calculateIndicators(closed)) return null;
  const now = Date.now();
  const ticker = binanceService.getTicker(symbol);
  const btcCandles = binanceService.getCandles('BTCUSDT').slice();
  const xauCandles = binanceService.getCandles('PAXGUSDT').slice();
  let mtf;
  try {
    mtf = await fetchMultiTimeframeAnalysis(symbol, closed);
  } catch {
    mtf = { signals: [], bullishCount: 0, bearishCount: 0, neutralCount: 0, alignment: 50, confidence: 0, dominantBias: 'MIXED' as const, score: 0 };
  }
  if (!isStale(closeTimeOf(lastClosed.time), now)) {
    patternDatabase.resolvePending(asset, lastClosed, now);
    signalHistory.resolvePending(asset, lastClosed, now);
  }
  return computeBrowserSignal({ asset, candles, btcCandles, xauCandles, ticker, mtf, now }, signalHistory, patternDatabase, true);
}
