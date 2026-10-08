// Market Regime Engine — Phase 21
// Classifies the market into one of 5 regimes and applies a compatibility
// multiplier to the raw signal score:  Signal Quality = Setup Quality × Regime Compatibility
import type { MarketStructure, VolatilityAnalysis, VolumeAnalysis, MultiTimeframeAnalysis, MarketRegimeAnalysis } from './types';
import type { Indicators } from './technicalAnalysis';
import { mtfAlignmentFor } from './multiTimeframe';

// EMA slope proxy: separation between EMA9 and EMA50 as % of price
function emaSlope(ind: Indicators): number {
  return Math.abs(ind.ema9 - ind.ema50) / ind.ema50 * 100;
}

export function detectMarketRegime(
  structure: MarketStructure,
  volatility: VolatilityAnalysis,
  volume: VolumeAnalysis,
  ind: Indicators,
  mtf: MultiTimeframeAnalysis,
): MarketRegimeAnalysis {
  const isBullStack = ind.ema9 > ind.ema21 && ind.ema21 > ind.ema50;
  const isBearStack = ind.ema9 < ind.ema21 && ind.ema21 < ind.ema50;
  const slope = emaSlope(ind);

  // ── 1. REVERSAL: CHoCH is the highest-priority structural signal ──────────
  if (structure.choch) {
    // Direction of the NEW move (opposite of the prior structure)
    const newDir =
      structure.type === 'STRONG_UPTREND' || structure.type === 'WEAK_UPTREND'   ? 'BEARISH' :
      structure.type === 'STRONG_DOWNTREND' || structure.type === 'WEAK_DOWNTREND' ? 'BULLISH' : 'NEUTRAL';
    return {
      regime: 'REVERSAL',
      direction: newDir,
      strength: Math.min(100, 50 + Math.round(structure.strength * 0.5)),
      multiplier: 1.0,
      description: `Change of Character confirmed — prior ${structure.type} reversing to ${newDir}`,
      compatibilityNote: 'Reversal regime — signals aligned with new direction upgraded, opposing signals penalized',
    };
  }

  // ── 2. COMPRESSION: BB squeeze + low ATR ─────────────────────────────────
  const isCompression = volatility.bbWidth < 1.8 && volatility.atrPct < 0.35 && !volatility.rangeExpansion;
  if (isCompression) {
    const squeezePct = Math.min(1, (1.8 - volatility.bbWidth) / 1.8);
    return {
      regime: 'COMPRESSION',
      direction: 'NEUTRAL',
      strength: Math.round(squeezePct * 100),
      multiplier: 1.0,
      description: `Volatility compression — BB width ${volatility.bbWidth.toFixed(2)}%, ATR ${volatility.atrPct.toFixed(2)}%`,
      compatibilityNote: 'Compression regime — signals premature; await breakout confirmation before acting',
    };
  }

  // ── 3. EXPANSION: range expansion + BOS or volume spike ──────────────────
  const isExpansion = volatility.rangeExpansion && (structure.bos || volume.spike);
  if (isExpansion) {
    const expDir =
      isBullStack || structure.type === 'STRONG_UPTREND' || structure.type === 'WEAK_UPTREND'     ? 'BULLISH' :
      isBearStack || structure.type === 'STRONG_DOWNTREND' || structure.type === 'WEAK_DOWNTREND' ? 'BEARISH' : 'NEUTRAL';
    const expStrength = Math.min(100, 55 + (volume.spike ? 25 : 0) + (structure.bos ? 20 : 0));
    return {
      regime: 'EXPANSION',
      direction: expDir,
      strength: expStrength,
      multiplier: 1.0,
      description: `Volatility expansion${structure.bos ? ' + BOS' : ''}${volume.spike ? ' + volume spike' : ''} — ${expDir} breakout`,
      compatibilityNote: 'Expansion regime — breakout signals aligned with expansion direction strongly upgraded',
    };
  }

  // ── 4. TRENDING: strong structure + full EMA stack + sufficient slope ─────
  const isTrending =
    (structure.type === 'STRONG_UPTREND'   && isBullStack && slope > 0.12) ||
    (structure.type === 'STRONG_DOWNTREND' && isBearStack && slope > 0.12);
  if (isTrending) {
    const trendDir = isBullStack ? 'BULLISH' : 'BEARISH';
    const mtfAlign = mtfAlignmentFor(mtf, trendDir === 'BULLISH'); // bearish share for downtrends (BUG-4)
    const trendStrength = Math.min(100, Math.round(
      structure.strength * 0.45 + mtfAlign * 0.35 + Math.min(slope * 20, 20)
    ));
    return {
      regime: 'TRENDING',
      direction: trendDir,
      strength: trendStrength,
      multiplier: 1.0,
      description: `${trendDir} trend — EMA stack aligned, ${structure.type}, MTF ${mtf.alignment}%, slope ${slope.toFixed(2)}%`,
      compatibilityNote: 'Trending regime — aligned signals upgraded; counter-trend signals significantly penalized',
    };
  }

  // ── 5. RANGING: default ───────────────────────────────────────────────────
  const rangingStrength = Math.max(0, Math.min(100, Math.round(80 - structure.strength * 0.4 - slope * 12)));
  return {
    regime: 'RANGING',
    direction: 'NEUTRAL',
    strength: rangingStrength,
    multiplier: 1.0,
    description: `Price ranging — ${structure.type}, EMA slope ${slope.toFixed(2)}%, BB width ${volatility.bbWidth.toFixed(2)}%`,
    compatibilityNote: 'Ranging regime — momentum signals downgraded; mean-reversion setups preferred',
  };
}

export function applyRegimeMultiplier(
  rawScore: number,
  regime: MarketRegimeAnalysis,
): { adjustedScore: number; multiplier: number; note: string | null } {
  if (rawScore === 0) return { adjustedScore: 0, multiplier: 1.0, note: null };

  const isSignalBull = rawScore > 0;
  let multiplier = 1.0;
  let note: string | null = null;

  switch (regime.regime) {
    case 'TRENDING': {
      const aligned =
        (isSignalBull  && regime.direction === 'BULLISH') ||
        (!isSignalBull && regime.direction === 'BEARISH');
      if (aligned) {
        multiplier = 1.25;
        note = `Regime TRENDING (${regime.direction}) — signal aligned, quality x1.25`;
      } else {
        multiplier = 0.65;
        note = `Regime TRENDING (${regime.direction}) — counter-trend signal, quality x0.65`;
      }
      break;
    }
    case 'RANGING':
      multiplier = 0.75;
      note = `Regime RANGING — momentum signal downgraded x0.75`;
      break;
    case 'COMPRESSION':
      multiplier = 0.82;
      note = `Regime COMPRESSION — signal premature, breakout not confirmed x0.82`;
      break;
    case 'EXPANSION': {
      const aligned =
        regime.direction === 'NEUTRAL' ||
        (isSignalBull  && regime.direction === 'BULLISH') ||
        (!isSignalBull && regime.direction === 'BEARISH');
      if (aligned) {
        multiplier = 1.20;
        note = `Regime EXPANSION (${regime.direction}) — breakout signal aligned x1.20`;
      } else {
        multiplier = 0.70;
        note = `Regime EXPANSION (${regime.direction}) — signal opposes breakout x0.70`;
      }
      break;
    }
    case 'REVERSAL': {
      const aligned =
        (isSignalBull  && regime.direction === 'BULLISH') ||
        (!isSignalBull && regime.direction === 'BEARISH');
      if (regime.direction === 'NEUTRAL') {
        multiplier = 0.90;
      } else if (aligned) {
        multiplier = 1.18;
        note = `Regime REVERSAL — signal aligns with CHoCH direction x1.18`;
      } else {
        multiplier = 0.62;
        note = `Regime REVERSAL — signal opposes CHoCH, fading prior trend x0.62`;
      }
      break;
    }
  }

  const adjustedScore = Math.max(-100, Math.min(100, rawScore * multiplier));
  return { adjustedScore, multiplier, note };
}
