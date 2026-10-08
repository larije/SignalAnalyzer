// Phase 5 — Volatility Regime Detection
import type { Candle } from './technicalAnalysis';
import type { Indicators } from './technicalAnalysis';
import type { VolatilityAnalysis, VolatilityRegime } from './types';

export function detectVolatilityRegime(
  price: number,
  ind: Indicators,
  candles: Candle[],
): VolatilityAnalysis {
  const atrPct  = price > 0 ? (ind.atr / price) * 100 : 0;
  const bbWidth = ind.bb.width;

  // Range expansion: compare avg range of last 5 bars vs last 20 bars
  const recent5  = candles.slice(-5).map(c => c.high - c.low);
  const older20  = candles.slice(-20).map(c => c.high - c.low);
  const avgRecent = recent5.reduce((a, b) => a + b, 0) / recent5.length;
  const avgOlder  = older20.reduce((a, b) => a + b, 0) / older20.length;
  const rangeExpansion = avgOlder > 0 && avgRecent > avgOlder * 1.30;

  // ── Regime classification ─────────────────────────────────────
  // Primary driver: BB width (universal)
  // Secondary:       ATR% (asset-specific)
  let regime: VolatilityRegime;
  let stopMultiplier: number;
  let tpMultiplier: number;
  let confidenceAdj: number;

  if (bbWidth < 1.0 && atrPct < 0.20) {
    regime = 'LOW';
    stopMultiplier = 1.2;
    tpMultiplier   = 2.5;
    confidenceAdj  = -5;  // Tight range → direction less certain
  } else if (bbWidth < 2.8 && atrPct < 0.60) {
    regime = 'NORMAL';
    stopMultiplier = 1.5;
    tpMultiplier   = 3.0;
    confidenceAdj  = 5;   // Ideal volatility for entries
  } else if (bbWidth < 5.0 && atrPct < 1.20) {
    regime = 'HIGH';
    stopMultiplier = 2.0;
    tpMultiplier   = 3.5;
    confidenceAdj  = 0;
  } else {
    regime = 'EXTREME';
    stopMultiplier = 2.5;
    tpMultiplier   = 4.0;
    confidenceAdj  = -10; // Extreme vol → stop hunting, unpredictable
  }

  // Range expansion widens stops further
  if (rangeExpansion) stopMultiplier = Math.min(3.0, stopMultiplier + 0.3);

  return { regime, atrPct, bbWidth, rangeExpansion, stopMultiplier, tpMultiplier, confidenceAdj };
}

export function regimeColor(regime: VolatilityRegime): string {
  switch (regime) {
    case 'LOW':     return '#34D399'; // green
    case 'NORMAL':  return '#60A5FA'; // blue
    case 'HIGH':    return '#FBBF24'; // amber
    case 'EXTREME': return '#F87171'; // red
  }
}

export function regimeLabel(regime: VolatilityRegime): string {
  switch (regime) {
    case 'LOW':     return '◎ LOW VOL';
    case 'NORMAL':  return '◉ NORMAL VOL';
    case 'HIGH':    return '● HIGH VOL';
    case 'EXTREME': return '⚠ EXTREME VOL';
  }
}
