// Non-repainting live signal computation.
//
// The last candle in a live stream is still forming; using it would make the
// signal change tick-by-tick (repaint). For copy-trading we compute on the last
// CLOSED candle only, so once a signal fires it is frozen. Both the SSE stream
// and browser runtimes share this numerical pipeline.
import type { Candle } from './technicalAnalysis';
import { calculateIndicators } from './technicalAnalysis';
import { generateEnhancedSignal, generateSignal, type TradingSignal } from './signalEngine';
import type { SignalType, MultiTimeframeAnalysis } from './types';
import { analyzeVolume } from './volumeAnalysis';
import { detectMarketStructure } from './marketStructure';
import { detectVolatilityRegime } from './volatilityRegime';
import { calculateVolumeProfile } from './volumeProfile';
import { analyzeSessionAt } from './sessionAnalysis';
import { detectPattern } from './patternRecognition';
import { analyzeSmartMoney } from './smartMoney';
import { assessNewsRiskAt } from './newsRisk';
import { analyzeCorrelations } from './correlationAnalysis';
import { detectMarketRegime } from './marketRegime';
import type { PatternDatabaseStore, TradeFeatures } from './patternDatabaseCore';
import type { SignalHistoryStore } from './signalHistoryCore';

/** Maximum age of the last closed candle before data is considered stale. */
export const STALE_MS = 90_000;

/** Length of the base signal candle. Binance kline `time` is the OPEN time. */
export const CANDLE_INTERVAL_MS = 60_000;

/**
 * A candle's close time = its open time + one interval. Binance stores the OPEN
 * time in `candle.time`, so measuring freshness against `candle.time` directly
 * treated a just-closed candle as up to a full interval old, flipping healthy
 * live data to "STALE — DO NOT TRADE" for part of every minute (BUG-5).
 */
export function closeTimeOf(openTime: number, intervalMs = CANDLE_INTERVAL_MS): number {
  return openTime + intervalMs;
}

/** The most recent fully-closed candle (the last array element is still forming). */
export function lastClosedCandle(candles: Candle[]): Candle | null {
  return candles.length >= 2 ? candles[candles.length - 2] : null;
}

/** All closed candles (drops the still-forming last one). */
export function closedCandles(candles: Candle[]): Candle[] {
  return candles.length >= 1 ? candles.slice(0, -1) : [];
}

/** True when the last closed candle is older than maxAgeMs — do not trade on stale data. */
export function isStale(lastCandleTime: number, now: number, maxAgeMs = STALE_MS): boolean {
  return now - lastCandleTime > maxAgeMs;
}

/**
 * Whether a computed signal should be written into the learning stores.
 * Never record from stale data — frozen prices would pollute the ledger with
 * synthetic outcomes while the UI says "do not trade" (BUG-6) — and only record
 * genuinely actionable directional signals.
 */
export function shouldRecordSignal(stale: boolean, signal: SignalType): boolean {
  return !stale && signal !== 'HOLD' && signal !== 'NO_TRADE';
}

export interface TickerData {
  symbol: string; price: number; open: number; high: number; low: number;
  volume: number; change: number; changePercent: number; timestamp: number;
}

export interface BrowserSignalInput {
  asset: 'BTC' | 'XAU';
  // Every candle array includes its forming last candle, excluded from analysis.
  candles: Candle[]; btcCandles: Candle[]; xauCandles: Candle[];
  ticker: TickerData | null; mtf: MultiTimeframeAnalysis; now: number;
}

export interface LiveSignalResult {
  asset: 'BTC' | 'XAU';
  signalCandleTime: number;   // close time of the candle the signal is based on
  stale: boolean;
  price: number;              // frozen signal entry (last closed candle close)
  livePrice: number | null;   // latest ticker price, for context only
  ticker: TickerData | null;  // backward-compat for current UI
  signal: TradingSignal;      // backward-compat legacy signal
  indicators: ReturnType<typeof calculateIndicators>;
  enhanced: ReturnType<typeof generateEnhancedSignal> & {
    mlProbability: ReturnType<PatternDatabaseStore['getMLProbability']>;
    adaptiveWeights: ReturnType<PatternDatabaseStore['getAdaptiveWeights']>;
  };
}

/**
 * Compute the non-repainting enhanced signal for one asset, record it (deduped),
 * and return the payload. Returns null if there aren't enough closed candles yet.
 */
export function computeBrowserSignal(
  input: BrowserSignalInput,
  signalHistory: SignalHistoryStore,
  patternDatabase: PatternDatabaseStore,
  record: boolean,
): LiveSignalResult | null {
  const { asset, ticker, mtf, now } = input;
  const allCandles = input.candles;
  const candles = closedCandles(allCandles);          // non-repainting: closed candles only
  const lastClosed = lastClosedCandle(allCandles);
  const ind = calculateIndicators(candles);
  if (!ind || !lastClosed) return null;

  const price = lastClosed.close;                      // frozen entry price

  // The candle's CLOSE time (open + interval) is when the frozen entry was set and
  // the correct reference for staleness/"as of" — `lastClosed.time` is the OPEN
  // time (BUG-5). Learning state must not be mutated from stale data (BUG-6).
  const signalCloseTime = closeTimeOf(lastClosed.time);
  const stale = isStale(signalCloseTime, now);

  // Cross-asset correlation uses both assets' closed candles.
  const btcCandles = closedCandles(input.btcCandles);
  const xauCandles = closedCandles(input.xauCandles);

  const volume = analyzeVolume(candles);
  const structure = detectMarketStructure(candles);
  const volatility = detectVolatilityRegime(price, ind, candles);

  const volumeProfile = calculateVolumeProfile(candles, 30);
  const session = analyzeSessionAt(new Date(now), candles);
  const pattern = detectPattern(candles);
  const smartMoney = analyzeSmartMoney(candles);
  const newsRisk = assessNewsRiskAt(new Date(now));
  const correlations = analyzeCorrelations(btcCandles, xauCandles, asset);
  const regime = detectMarketRegime(structure, volatility, volume, ind, mtf);

  // The runtime resolves closed candles chronologically before this calculation.
  const adaptiveWeights = patternDatabase.getAdaptiveWeights(asset);

  const enhanced = generateEnhancedSignal(
    price, ind, volume, structure, volatility, mtf, pattern, smartMoney,
    newsRisk, session, volumeProfile, correlations, regime, adaptiveWeights,
  );

  const features: TradeFeatures = {
    pattern: pattern.pattern, patternConfidence: pattern.confidence, patternDirection: pattern.direction,
    regime: regime.regime, regimeDirection: regime.direction, mtfAlignment: mtf.alignment,
    dominantBias: mtf.dominantBias, structureType: structure.type, volumeConfirmation: volume.confirmation,
    session: session.currentSession, signalType: enhanced.signal, score: enhanced.score,
    confidence: enhanced.confidence, rr: enhanced.riskMetrics.riskReward, componentScores: enhanced.componentScores,
  };
  const mlProbability = patternDatabase.getMLProbability(features, asset);

  // Record only genuinely actionable signals, and never from stale data. The
  // stores de-duplicate open setups and are keyed to the closed candle, so this
  // is non-repainting.
  if (record && shouldRecordSignal(stale, enhanced.signal)) {
    const tradeId = `${asset}-${signalCloseTime}-${enhanced.signal}`;
    signalHistory.record(asset, enhanced.signal, enhanced.score, enhanced.confidence, price, enhanced.stopLoss, enhanced.takeProfit, signalCloseTime, tradeId);
    patternDatabase.record(tradeId, asset, features, price, enhanced.stopLoss, enhanced.takeProfit, signalCloseTime);
  }

  return {
    asset,
    signalCandleTime: signalCloseTime,
    stale,
    price,
    livePrice: ticker?.price ?? null,
    ticker: ticker ?? null,
    signal: generateSignal(price, ind),
    indicators: ind,
    enhanced: { ...enhanced, mlProbability, adaptiveWeights },
  };
}
