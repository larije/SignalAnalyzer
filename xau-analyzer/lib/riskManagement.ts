// Phase 6 — Advanced Dynamic Risk Management
import type { Indicators } from './technicalAnalysis';
import type { MarketStructure, VolatilityAnalysis, RiskMetrics, SignalType, TradeQuality } from './types';

export function calculateRiskMetrics(
  price: number,
  signal: SignalType,
  ind: Indicators,
  structure: MarketStructure,
  volatility: VolatilityAnalysis,
  score: number,
): RiskMetrics {
  const isBull = signal === 'BUY' || signal === 'STRONG_BUY';
  const isBear = signal === 'SELL' || signal === 'STRONG_SELL';
  const atr = ind.atr > 0 ? ind.atr : price * 0.002;

  // ── Dynamic Stop Loss ──────────────────────────────────────────
  // Blend ATR-based stop with structure-based stop
  const atrStop = atr * volatility.stopMultiplier;

  let stopDist: number;
  let tpDist: number;

  if (isBull) {
    // Structure SL: distance to most recent swing low + buffer
    const structSL = structure.swingLow > 0 && structure.swingLow < price
      ? (price - structure.swingLow) * 0.85 + atr * 0.25
      : atrStop;
    // Use whichever is tighter but still beyond 1×ATR
    stopDist = Math.max(atr * 0.8, Math.min(structSL, atrStop * 1.5));

    // TP: toward swing high or ATR projection
    const structTP = structure.swingHigh > price
      ? (structure.swingHigh - price) * 0.90
      : atr * volatility.tpMultiplier;
    tpDist = Math.min(atr * volatility.tpMultiplier * 1.5, Math.max(structTP, atr * volatility.tpMultiplier));
  } else if (isBear) {
    const structSL = structure.swingHigh > 0 && structure.swingHigh > price
      ? (structure.swingHigh - price) * 0.85 + atr * 0.25
      : atrStop;
    stopDist = Math.max(atr * 0.8, Math.min(structSL, atrStop * 1.5));

    const structTP = structure.swingLow > 0 && structure.swingLow < price
      ? (price - structure.swingLow) * 0.90
      : atr * volatility.tpMultiplier;
    tpDist = Math.min(atr * volatility.tpMultiplier * 1.5, Math.max(structTP, atr * volatility.tpMultiplier));
  } else {
    stopDist = atr * 1.5;
    tpDist   = atr * 3.0;
  }

  const stopLoss   = isBull ? price - stopDist : price + stopDist;
  const takeProfit = isBull ? price + tpDist   : price - tpDist;

  // Secondary levels (wider for scaling)
  const stopLoss2   = isBull ? price - stopDist * 1.6 : price + stopDist * 1.6;
  const takeProfit2 = isBull ? price + tpDist   * 1.8 : price - tpDist   * 1.8;

  // ── Risk-to-Reward ─────────────────────────────────────────────
  const riskReward = stopDist > 0 ? +(tpDist / stopDist).toFixed(2) : 0;

  // ── Expected Value (simplified Kelly-style) ────────────────────
  const scoreAbs = Math.abs(score);
  const baseWinProb = 0.40 + scoreAbs * 0.001; // 40-50% base range
  const winProb = Math.min(0.65, Math.max(0.30, baseWinProb));
  const expectedValue = (winProb * tpDist) - ((1 - winProb) * stopDist);

  // ── Trade Quality Score ────────────────────────────────────────
  let qualityScore = 0;

  // R:R quality (max 35 pts)
  if (riskReward >= 3.0)      qualityScore += 35;
  else if (riskReward >= 2.0) qualityScore += 25;
  else if (riskReward >= 1.5) qualityScore += 15;
  else if (riskReward >= 1.0) qualityScore += 5;

  // Expected value (max 25 pts)
  if (expectedValue > stopDist * 0.5) qualityScore += 25;
  else if (expectedValue > 0)         qualityScore += 15;
  else if (expectedValue > -stopDist * 0.3) qualityScore += 5;

  // Signal strength (max 25 pts)
  if (scoreAbs >= 70)      qualityScore += 25;
  else if (scoreAbs >= 55) qualityScore += 18;
  else if (scoreAbs >= 35) qualityScore += 10;
  else if (scoreAbs >= 20) qualityScore += 4;

  // Structure alignment (max 15 pts)
  const structAligned =
    (isBull && (structure.type === 'STRONG_UPTREND' || structure.type === 'WEAK_UPTREND')) ||
    (isBear && (structure.type === 'STRONG_DOWNTREND' || structure.type === 'WEAK_DOWNTREND'));
  if (structAligned && structure.strength >= 70) qualityScore += 15;
  else if (structAligned) qualityScore += 8;

  qualityScore = Math.min(100, qualityScore);

  const tradeQuality: TradeQuality =
    qualityScore >= 72 ? 'EXCELLENT' :
    qualityScore >= 44 ? 'GOOD' : 'POOR';

  return {
    stopLoss, takeProfit, stopLoss2, takeProfit2,
    riskReward, expectedValue, tradeQuality, qualityScore,
  };
}

export function qualityColor(q: TradeQuality): string {
  switch (q) {
    case 'EXCELLENT': return '#34D399';
    case 'GOOD':      return '#FBBF24';
    case 'POOR':      return '#F87171';
  }
}
