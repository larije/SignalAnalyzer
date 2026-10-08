// Phase 1 — Multi-Timeframe Confluence Engine
// Fetches 5m/15m/1h/4h candles from Binance and scores each timeframe
import type { Candle } from './technicalAnalysis';
import { calculateIndicators, macdCross } from './technicalAnalysis';
import { TIMEFRAME_THRESHOLDS } from './config';
import type {
  MultiTimeframeAnalysis, TimeframeSignal, SignalType, EMAAlignment, TrendDirection,
} from './types';

const TF_CONFIG = [
  { interval: '1m',  label: '1 Minute',   purpose: 'Entry Timing',    limit: 100 },
  { interval: '5m',  label: '5 Minute',   purpose: 'Short-Term Trend', limit: 100 },
  { interval: '15m', label: '15 Minute',  purpose: 'Confirmation',     limit: 100 },
  { interval: '1h',  label: '1 Hour',     purpose: 'Primary Trend',    limit: 100 },
  { interval: '4h',  label: '4 Hour',     purpose: 'Market Bias',      limit: 60  },
] as const;

/**
 * Drop the still-forming last candle. Binance's /klines returns the in-progress
 * candle as the last element; scoring it made the higher-timeframe read whipsaw
 * within each HTF period and leaked partial-bar data into the signal (BUG-8).
 * The 1m base is already stripped of its forming bar upstream (closedCandles).
 */
export function closedOnly<T>(candles: T[]): T[] {
  return candles.length > 0 ? candles.slice(0, -1) : candles;
}

async function fetchCandles(symbol: string, interval: string, limit: number): Promise<Candle[]> {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const raw = await res.json() as string[][];
    return closedOnly(raw.map(k => ({
      time:   parseInt(k[0]),
      open:   parseFloat(k[1]),
      high:   parseFloat(k[2]),
      low:    parseFloat(k[3]),
      close:  parseFloat(k[4]),
      volume: parseFloat(k[5]),
    })));
  } catch {
    return [];
  }
}

function scoreTimeframe(candles: Candle[], interval: string, label: string): TimeframeSignal | null {
  if (candles.length < 55) return null;
  const ind = calculateIndicators(candles);
  if (!ind) return null;

  let score = 0;

  // RSI (0-30 pts directional weight)
  if (ind.rsi < 25)      score += 30;
  else if (ind.rsi < 40) score += 12;
  else if (ind.rsi < 48) score += 4;
  else if (ind.rsi > 75) score -= 30;
  else if (ind.rsi > 60) score -= 12;
  else if (ind.rsi > 52) score -= 4;

  // MACD (0-20 pts): a real cross (sign flip) is worth more than sustained momentum
  switch (macdCross(ind.macd)) {
    case 'BULL_CROSS': score += 20; break;
    case 'BULL':       score += 8;  break;
    case 'BEAR_CROSS': score -= 20; break;
    case 'BEAR':       score -= 8;  break;
  }

  // EMA alignment (0-20 pts)
  const emaAlignment: EMAAlignment =
    ind.ema9 > ind.ema21 && ind.ema21 > ind.ema50 ? 'BULL' :
    ind.ema9 < ind.ema21 && ind.ema21 < ind.ema50 ? 'BEAR' : 'NEUTRAL';
  if (emaAlignment === 'BULL')    score += 20;
  else if (emaAlignment === 'BEAR') score -= 20;
  else score += (ind.ema9 > ind.ema21 ? 5 : -5);

  // Price vs EMA50 (trend bias, 0-10 pts)
  const price = candles[candles.length - 1].close;
  if (price > ind.ema50) score += 10;
  else                   score -= 10;

  const priceVsEma9: 'ABOVE' | 'BELOW' = price > ind.ema9 ? 'ABOVE' : 'BELOW';

  const signal: SignalType =
    score >= TIMEFRAME_THRESHOLDS.strong       ? 'STRONG_BUY' :
    score >= TIMEFRAME_THRESHOLDS.directional  ? 'BUY' :
    score <= -TIMEFRAME_THRESHOLDS.strong      ? 'STRONG_SELL' :
    score <= -TIMEFRAME_THRESHOLDS.directional ? 'SELL' : 'HOLD';

  const trend: TrendDirection =
    score > TIMEFRAME_THRESHOLDS.directional ? 'UP' :
    score < -TIMEFRAME_THRESHOLDS.directional ? 'DOWN' : 'SIDEWAYS';

  return {
    timeframe: label,
    interval,
    signal,
    score,
    emaAlignment,
    trend,
    rsi: ind.rsi,
    macdBull: ind.macd.histogram > 0,
    priceVsEma9,
  };
}

/**
 * Fetch all timeframes concurrently and compute MTF analysis.
 * Pass base 1m candles to avoid refetching.
 */
export async function fetchMultiTimeframeAnalysis(
  symbol: string,
  baseCandles1m: Candle[],
): Promise<MultiTimeframeAnalysis> {
  // Fetch 5m/15m/1h/4h concurrently
  const [c5m, c15m, c1h, c4h] = await Promise.all([
    fetchCandles(symbol, '5m',  100),
    fetchCandles(symbol, '15m', 100),
    fetchCandles(symbol, '1h',  100),
    fetchCandles(symbol, '4h',  60),
  ]);

  const tfData: [Candle[], string, string][] = [
    [baseCandles1m,  '1m',  '1 Minute'  ],
    [c5m,            '5m',  '5 Minute'  ],
    [c15m,           '15m', '15 Minute' ],
    [c1h,            '1h',  '1 Hour'    ],
    [c4h,            '4h',  '4 Hour'    ],
  ];

  return mtfFromTimeframes(tfData);
}

/**
 * Alignment measured in the signal's OWN direction: the bullish share for longs,
 * the bearish share for shorts. `mtf.alignment` alone is only the bullish share,
 * so `100 - alignment` for shorts counted every HOLD timeframe as bearish
 * confirmation (BUG-4). Uses the real bearishCount instead.
 */
export function mtfAlignmentFor(mtf: MultiTimeframeAnalysis, isBull: boolean): number {
  if (isBull) return mtf.alignment;
  const n = Math.max(1, mtf.signals.length);
  return Math.round((mtf.bearishCount / n) * 100);
}

/**
 * Pure aggregation of per-timeframe signals into an MTF analysis.
 * Shared by the live path (real fetched candles) and the backtest
 * (candles resampled from a single base interval).
 */
export function mtfFromTimeframes(tfData: [Candle[], string, string][]): MultiTimeframeAnalysis {
  const signals: TimeframeSignal[] = [];
  for (const [candles, interval, label] of tfData) {
    const sig = scoreTimeframe(candles, interval, label);
    if (sig) signals.push(sig);
  }

  if (signals.length === 0) {
    return {
      signals: [], bullishCount: 0, bearishCount: 0, neutralCount: 0,
      alignment: 50, confidence: 0, dominantBias: 'MIXED', score: 0,
    };
  }

  const bullish = signals.filter(s => s.signal === 'STRONG_BUY' || s.signal === 'BUY').length;
  const bearish = signals.filter(s => s.signal === 'STRONG_SELL' || s.signal === 'SELL').length;
  const neutral = signals.length - bullish - bearish;

  // Alignment: 0% = all bear, 100% = all bull
  const alignment = Math.round((bullish / signals.length) * 100);

  // Confidence: penalise disagreement and neutral signals
  const disagreement = Math.min(bullish, bearish) / signals.length;
  const neutralPenalty = (neutral / signals.length) * 0.3;
  const confidence = Math.max(0, Math.round((1 - disagreement * 2 - neutralPenalty) * 100));

  const dominantBias =
    bullish >= bearish + 2 ? 'BULLISH' :
    bearish >= bullish + 2 ? 'BEARISH' : 'MIXED';

  // Aggregate score (-25 to +25)
  const score = Math.round(
    signals.reduce((sum, s) => sum + (
      s.signal === 'STRONG_BUY'   ?  5 :
      s.signal === 'BUY'          ?  3 :
      s.signal === 'STRONG_SELL'  ? -5 :
      s.signal === 'SELL'         ? -3 : 0
    ), 0) * (25 / (signals.length * 5))
  );

  return {
    signals, bullishCount: bullish, bearishCount: bearish, neutralCount: neutral,
    alignment, confidence, dominantBias, score,
  };
}
