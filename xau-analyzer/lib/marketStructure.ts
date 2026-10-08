// Phase 3 — Market Structure Engine: HH/HL/LH/LL, BOS, CHOCH
import type { Candle } from './technicalAnalysis';
import type { MarketStructure, MarketStructureType } from './types';

interface Pivot {
  idx: number;
  price: number;
}

/** Identify swing highs and swing lows with a configurable left/right window */
function findPivots(
  candles: Candle[],
  window = 3,
): { highs: Pivot[]; lows: Pivot[] } {
  const highs: Pivot[] = [];
  const lows:  Pivot[] = [];

  for (let i = window; i < candles.length - window; i++) {
    const hi = candles[i].high;
    const lo = candles[i].low;

    let isHigh = true;
    let isLow  = true;
    for (let j = i - window; j <= i + window; j++) {
      if (j === i) continue;
      if (candles[j].high >= hi) isHigh = false;
      if (candles[j].low  <= lo) isLow  = false;
    }
    if (isHigh) highs.push({ idx: i, price: hi });
    if (isLow)  lows.push({ idx: i, price: lo });
  }

  return { highs, lows };
}

export function detectMarketStructure(candles: Candle[]): MarketStructure {
  const allHighs = candles.map(c => c.high);
  const allLows  = candles.map(c => c.low);

  if (candles.length < 30) {
    return {
      type: 'RANGE', recentHH: false, recentHL: false, recentLH: false, recentLL: false,
      bos: false, choch: false,
      swingHigh: Math.max(...allHighs), swingLow: Math.min(...allLows),
      score: 0, strength: 40,
    };
  }

  const { highs: pivotHighs, lows: pivotLows } = findPivots(candles);

  // Use last 4 pivots for structure analysis
  const rh = pivotHighs.slice(-4);
  const rl = pivotLows.slice(-4);

  const swingHigh = rh.length > 0 ? Math.max(...rh.map(p => p.price)) : Math.max(...allHighs.slice(-20));
  const swingLow  = rl.length > 0 ? Math.min(...rl.map(p => p.price)) : Math.min(...allLows.slice(-20));

  // ── HH / HL / LH / LL ──────────────────────────────────────────
  const recentHH = rh.length >= 2 && rh[rh.length - 1].price > rh[rh.length - 2].price;
  const recentLH = rh.length >= 2 && rh[rh.length - 1].price < rh[rh.length - 2].price;
  const recentHL = rl.length >= 2 && rl[rl.length - 1].price > rl[rl.length - 2].price;
  const recentLL = rl.length >= 2 && rl[rl.length - 1].price < rl[rl.length - 2].price;

  // ── Break of Structure ──────────────────────────────────────────
  // BOS bullish: current close > previous swing high
  // BOS bearish: current close < previous swing low
  const currentPrice = candles[candles.length - 1].close;
  const prevSwingHigh = rh.length >= 2 ? rh[rh.length - 2].price : swingHigh;
  const prevSwingLow  = rl.length >= 2 ? rl[rl.length - 2].price : swingLow;
  const bosBull = currentPrice > prevSwingHigh;
  const bosBear = currentPrice < prevSwingLow;
  const bos = bosBull || bosBear;

  // ── Change of Character (CHOCH) ─────────────────────────────────
  // Was uptrend (HH+HL), now first LL or LH → bearish CHOCH
  // Was downtrend (LH+LL), now first HH or HL → bullish CHOCH
  const wasUptrend   = rh.length >= 3 && rl.length >= 3 &&
    rh[rh.length - 2].price > rh[rh.length - 3].price &&
    rl[rl.length - 2].price > rl[rl.length - 3].price;
  const wasDowntrend = rh.length >= 3 && rl.length >= 3 &&
    rh[rh.length - 2].price < rh[rh.length - 3].price &&
    rl[rl.length - 2].price < rl[rl.length - 3].price;
  const choch = (wasUptrend && recentLL) || (wasDowntrend && recentHH);

  // ── Classify & score ────────────────────────────────────────────
  let type: MarketStructureType;
  let score = 0;
  let strength = 40;

  if (recentHH && recentHL) {
    type = 'STRONG_UPTREND'; score = 20; strength = 85;
  } else if (recentHH || recentHL) {
    type = 'WEAK_UPTREND';   score = 10; strength = 60;
  } else if (recentLH && recentLL) {
    type = 'STRONG_DOWNTREND'; score = -20; strength = 85;
  } else if (recentLH || recentLL) {
    type = 'WEAK_DOWNTREND'; score = -10; strength = 60;
  } else {
    type = 'RANGE';  score = 0; strength = 40;
  }

  // BOS adds structural confirmation
  if (bos && bosBull && score >= 0) score = Math.min(20, score + 5);
  if (bos && bosBear && score <= 0) score = Math.max(-20, score - 5);

  // CHOCH reversal potential slightly reduces confidence
  if (choch) strength = Math.max(30, strength - 15);

  return {
    type, recentHH, recentHL, recentLH, recentLL,
    bos, choch, swingHigh, swingLow,
    score, strength,
  };
}

/** Short human-readable label for the market structure */
export function structureLabel(type: MarketStructureType): string {
  switch (type) {
    case 'STRONG_UPTREND':   return '▲▲ Strong Uptrend';
    case 'WEAK_UPTREND':     return '▲ Weak Uptrend';
    case 'RANGE':            return '↔ Range / Consolidation';
    case 'WEAK_DOWNTREND':   return '▼ Weak Downtrend';
    case 'STRONG_DOWNTREND': return '▼▼ Strong Downtrend';
  }
}
