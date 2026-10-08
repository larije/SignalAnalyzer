export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Indicators {
  rsi: number;
  // histogram = value - signal for the last closed bar; prevHistogram is the same
  // for the bar before it, so callers can detect a REAL cross (sign flip) rather
  // than treating "histogram > 0" as a crossover on every bar (see macdCross).
  macd: { value: number; signal: number; histogram: number; prevHistogram: number };
  bb: { upper: number; middle: number; lower: number; width: number };
  ema9: number;
  ema21: number;
  ema50: number;
  ema200: number | null;   // null until >= 200 candles exist (do not label as EMA200 when null)
  atr: number;
  stoch: { k: number; d: number };
  volume: number;
  volumeMA: number;       // 20-period simple MA of volume
  relativeVolume: number; // current volume / volumeMA
}

export type MacdCross = 'BULL_CROSS' | 'BEAR_CROSS' | 'BULL' | 'BEAR' | 'FLAT';

/**
 * Classify the MACD state from the last two histogram values.
 *
 * A crossover is a SIGN FLIP between bars, not merely "histogram is positive".
 * Because histogram === value - signal, `histogram > 0` is identical to
 * `value > signal`, so the old `histogram > 0 && value > signal` test fired on
 * every bar the line was above signal — never distinguishing a real cross from
 * sustained momentum (BUG-1). This compares against the previous bar instead.
 */
export function macdCross(macd: { histogram: number; prevHistogram: number }): MacdCross {
  const { histogram: h, prevHistogram: p } = macd;
  if (h > 0 && p <= 0) return 'BULL_CROSS';
  if (h < 0 && p >= 0) return 'BEAR_CROSS';
  if (h > 0) return 'BULL';
  if (h < 0) return 'BEAR';
  return 'FLAT';
}

export function calcEMA(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

export function calcSMA(values: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    result.push(sum / period);
  }
  return result;
}

export function calcRSI(closes: number[], period = 14): number[] {
  const result: number[] = [];
  if (closes.length < period + 1) return result;

  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < closes.length; i++) {
    if (i > period) {
      const d = closes[i] - closes[i - 1];
      avgGain = (avgGain * (period - 1) + Math.max(0, d)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period;
    }
    const rs = avgGain / (avgLoss || 1e-10);
    result.push(100 - 100 / (1 + rs));
  }
  return result;
}

export function calculateIndicators(candles: Candle[]): Indicators | null {
  if (candles.length < 55) return null;

  const closes  = candles.map(c => c.close);
  const highs   = candles.map(c => c.high);
  const lows    = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);

  // RSI
  const rsiArr = calcRSI(closes, 14);
  const rsi = rsiArr[rsiArr.length - 1] ?? 50;

  // EMA
  const ema9v   = calcEMA(closes, 9);
  const ema21v  = calcEMA(closes, 21);
  const ema50v  = calcEMA(closes, 50);
  // EMA200 — only a real 200-period EMA counts. Null when we lack the data
  // (callers must not display or reason about it as "EMA200" when null).
  const ema200v = closes.length >= 200 ? calcEMA(closes, 200) : null;

  // MACD (EMA12 - EMA26, signal EMA9)
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macdLine   = ema12.map((v, i) => v - ema26[i]);
  const signalLine = calcEMA(macdLine, 9);
  const lastMacd   = macdLine[macdLine.length - 1];
  const lastSig    = signalLine[signalLine.length - 1];
  const prevMacd   = macdLine[macdLine.length - 2];
  const prevSig    = signalLine[signalLine.length - 2];

  // Bollinger Bands (20, 2σ)
  const smaArr  = calcSMA(closes, 20);
  const lastSMA = smaArr[smaArr.length - 1];
  const slice   = closes.slice(-20);
  const variance = slice.reduce((s, v) => s + (v - lastSMA) ** 2, 0) / 20;
  const std    = Math.sqrt(variance);
  const upper  = lastSMA + 2 * std;
  const lower  = lastSMA - 2 * std;

  // ATR (14)
  const tr: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const pc = closes[i - 1];
    tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - pc), Math.abs(lows[i] - pc)));
  }
  const atrArr = calcSMA(tr, 14);
  const atr    = atrArr[atrArr.length - 1] ?? 0;

  // Stochastic (14, smooth 3)
  const kValues: number[] = [];
  for (let i = 13; i < candles.length; i++) {
    const hi = Math.max(...highs.slice(i - 13, i + 1));
    const lo = Math.min(...lows.slice(i - 13, i + 1));
    kValues.push(((closes[i] - lo) / (hi - lo || 1)) * 100);
  }
  const dValues = calcSMA(kValues, 3);

  // Volume MA (20-period)
  const volSMA   = calcSMA(volumes, 20);
  const volumeMA = volSMA[volSMA.length - 1] ?? 1;
  const currentVol = volumes[volumes.length - 1];
  const relativeVolume = volumeMA > 0 ? currentVol / volumeMA : 1;

  return {
    rsi,
    macd: { value: lastMacd, signal: lastSig, histogram: lastMacd - lastSig, prevHistogram: prevMacd - prevSig },
    bb: { upper, middle: lastSMA, lower, width: ((upper - lower) / lastSMA) * 100 },
    ema9:  ema9v[ema9v.length - 1],
    ema21: ema21v[ema21v.length - 1],
    ema50: ema50v[ema50v.length - 1],
    ema200: ema200v ? ema200v[ema200v.length - 1] : null,
    atr,
    stoch: {
      k: kValues[kValues.length - 1] ?? 50,
      d: dValues[dValues.length - 1] ?? 50,
    },
    volume:         currentVol,
    volumeMA,
    relativeVolume,
  };
}
