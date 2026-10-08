// Signal Engine — Phase 4 upgrade + institutional STRONG signal gate
import type { Indicators } from './technicalAnalysis';
import { macdCross } from './technicalAnalysis';
import type {
  SignalType, EnhancedTradingSignal, VolumeAnalysis, MarketStructure,
  VolatilityAnalysis, MultiTimeframeAnalysis, ComponentScores,
  PatternResult, SmartMoneyAnalysis, NewsRiskAssessment,
  SessionAnalysis, VolumeProfile, CorrelationAnalysis, MarketRegimeAnalysis,
} from './types';
import type { AdaptiveWeights } from './patternDatabase';
import { applyRegimeMultiplier } from './marketRegime';
import { mtfAlignmentFor } from './multiTimeframe';
import {
  MIN_ADAPT_SAMPLES, GATE_MTF_ALIGNMENT, GATE_PATTERN_CONF,
  ENHANCED_THRESHOLDS, LEGACY_THRESHOLDS,
} from './config';
import { calculateRiskMetrics } from './riskManagement';
import { calculateDynamicConfidence } from './confidenceModel';

// ── Legacy interface (backward-compatible) ────────────────────────────────────
export type { SignalType };

export interface TradingSignal {
  signal: SignalType;
  confidence: number;
  score: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  reasons: string[];
}

// ── Shared MACD score (-25 to +25) ────────────────────────────────────────────
// A real crossover (sign flip vs the previous bar) is worth ±25 and earns a
// reason string; sustained momentum is worth ±10 with no crossover claim.
// Used by both the legacy and enhanced engines so they can never disagree.
function scoreMacd(macd: Indicators['macd']): { score: number; reason: string | null } {
  switch (macdCross(macd)) {
    case 'BULL_CROSS': return { score: 25,  reason: 'MACD bullish crossover' };
    case 'BEAR_CROSS': return { score: -25, reason: 'MACD bearish crossover' };
    case 'BULL':       return { score: 10,  reason: null };
    case 'BEAR':       return { score: -10, reason: null };
    default:           return { score: 0,   reason: null };
  }
}

// ── Legacy sync generator (unchanged behaviour) ───────────────────────────────
export function generateSignal(price: number, ind: Indicators): TradingSignal {
  let score = 0;
  const reasons: string[] = [];

  // RSI (-30 to +30)
  if (ind.rsi < 25)      { score += 30; reasons.push('RSI deeply oversold'); }
  else if (ind.rsi < 35) { score += 18; reasons.push('RSI oversold'); }
  else if (ind.rsi < 45) { score += 8; }
  else if (ind.rsi > 75) { score -= 30; reasons.push('RSI deeply overbought'); }
  else if (ind.rsi > 65) { score -= 18; reasons.push('RSI overbought'); }
  else if (ind.rsi > 55) { score -= 8; }

  // MACD (-25 to +25)
  const macdResult = scoreMacd(ind.macd);
  score += macdResult.score;
  if (macdResult.reason) reasons.push(macdResult.reason);

  // Bollinger Bands (-20 to +20)
  if (price <= ind.bb.lower)       { score += 20; reasons.push('Price at lower Bollinger Band'); }
  else if (price < ind.bb.middle)  { score += 5; }
  else if (price >= ind.bb.upper)  { score -= 20; reasons.push('Price at upper Bollinger Band'); }
  else if (price > ind.bb.middle)  { score -= 5; }

  // EMA alignment (-15 to +15)
  if (ind.ema9 > ind.ema21 && ind.ema21 > ind.ema50) {
    score += 15; reasons.push('Bullish EMA alignment (9>21>50)');
  } else if (ind.ema9 > ind.ema21) {
    score += 7;
  } else if (ind.ema9 < ind.ema21 && ind.ema21 < ind.ema50) {
    score -= 15; reasons.push('Bearish EMA alignment (9<21<50)');
  } else {
    score -= 7;
  }

  // Stochastic (-10 to +10)
  if (ind.stoch.k < 20 && ind.stoch.d < 20)     { score += 10; reasons.push('Stochastic oversold'); }
  else if (ind.stoch.k > 80 && ind.stoch.d > 80) { score -= 10; reasons.push('Stochastic overbought'); }

  score = Math.max(-100, Math.min(100, score));

  let signal: SignalType;
  if (score >= LEGACY_THRESHOLDS.strong)            signal = 'STRONG_BUY';
  else if (score >= LEGACY_THRESHOLDS.directional)  signal = 'BUY';
  else if (score <= -LEGACY_THRESHOLDS.strong)      signal = 'STRONG_SELL';
  else if (score <= -LEGACY_THRESHOLDS.directional) signal = 'SELL';
  else                                              signal = 'HOLD';

  const confidence = Math.round(Math.abs(score));
  const slDist = (ind.atr || price * 0.002) * 1.5;
  const tpDist = (ind.atr || price * 0.002) * 3;
  const bull = signal === 'STRONG_BUY' || signal === 'BUY';
  const bear = signal === 'STRONG_SELL' || signal === 'SELL';

  return {
    signal,
    confidence,
    score,
    entryPrice: price,
    stopLoss:   bull ? price - slDist : bear ? price + slDist : price - slDist,
    takeProfit: bull ? price + tpDist : bear ? price - tpDist : price + tpDist,
    reasons,
  };
}

// ── Enhanced signal generator (all phases integrated) ────────────────────────
export function generateEnhancedSignal(
  price: number,
  ind: Indicators,
  volume: VolumeAnalysis,
  structure: MarketStructure,
  volatility: VolatilityAnalysis,
  mtf: MultiTimeframeAnalysis,
  pattern: PatternResult,
  smartMoney: SmartMoneyAnalysis,
  newsRisk: NewsRiskAssessment,
  session: SessionAnalysis,
  volumeProfile: VolumeProfile,
  correlations: CorrelationAnalysis,
  regime: MarketRegimeAnalysis,
  weights?: AdaptiveWeights,
): EnhancedTradingSignal {
  const reasons: string[] = [];
  let rsiScore = 0, macdScore = 0, bbScore = 0, emaScore = 0, stochScore = 0;

  // ── RSI (-30 to +30) ──────────────────────────────────────────
  if (ind.rsi < 25)      { rsiScore = 30;  reasons.push('RSI deeply oversold (<25)'); }
  else if (ind.rsi < 35) { rsiScore = 18;  reasons.push('RSI oversold (<35)'); }
  else if (ind.rsi < 45) { rsiScore = 8; }
  else if (ind.rsi > 75) { rsiScore = -30; reasons.push('RSI deeply overbought (>75)'); }
  else if (ind.rsi > 65) { rsiScore = -18; reasons.push('RSI overbought (>65)'); }
  else if (ind.rsi > 55) { rsiScore = -8; }

  // ── MACD (-25 to +25) ─────────────────────────────────────────
  const macdResult = scoreMacd(ind.macd);
  macdScore = macdResult.score;
  if (macdResult.reason) reasons.push(macdResult.reason);

  // ── Bollinger Bands (-20 to +20) ──────────────────────────────
  if (price <= ind.bb.lower)       { bbScore = 20;  reasons.push('Price at/below lower BB'); }
  else if (price < ind.bb.middle)  { bbScore = 5; }
  else if (price >= ind.bb.upper)  { bbScore = -20; reasons.push('Price at/above upper BB'); }
  else if (price > ind.bb.middle)  { bbScore = -5; }

  // ── EMA alignment (-15 to +15) ────────────────────────────────
  if (ind.ema9 > ind.ema21 && ind.ema21 > ind.ema50) {
    emaScore = 15; reasons.push('Bullish EMA stack (9>21>50)');
  } else if (ind.ema9 > ind.ema21) {
    emaScore = 7;
  } else if (ind.ema9 < ind.ema21 && ind.ema21 < ind.ema50) {
    emaScore = -15; reasons.push('Bearish EMA stack (9<21<50)');
  } else {
    emaScore = -7;
  }
  if (ind.ema200 !== null) {
    if (price > ind.ema200) emaScore = Math.min(15, emaScore + 3);
    else                    emaScore = Math.max(-15, emaScore - 3);
  }

  // ── Stochastic (-10 to +10) ───────────────────────────────────
  if (ind.stoch.k < 20 && ind.stoch.d < 20)      { stochScore = 10;  reasons.push('Stochastic oversold'); }
  else if (ind.stoch.k < 30 && ind.stoch.k > ind.stoch.d) { stochScore = 5; }
  else if (ind.stoch.k > 80 && ind.stoch.d > 80) { stochScore = -10; reasons.push('Stochastic overbought'); }
  else if (ind.stoch.k > 70 && ind.stoch.k < ind.stoch.d) { stochScore = -5; }

  // ── Volume score (-15 to +15) — already computed ─────────────
  const volumeScore = volume.score;
  if (volume.confirmation === 'STRONG_BULL') reasons.push('High volume bullish breakout');
  if (volume.confirmation === 'STRONG_BEAR') reasons.push('High volume bearish breakdown');
  if (volume.confirmation === 'NEUTRAL' && volume.ratio < 0.6) reasons.push('Low volume — weak conviction');

  // ── Market structure (-20 to +20) ────────────────────────────
  const structureScore = structure.score;
  if (structure.type === 'STRONG_UPTREND')   reasons.push('Market structure: Strong uptrend (HH+HL)');
  if (structure.type === 'STRONG_DOWNTREND') reasons.push('Market structure: Strong downtrend (LH+LL)');
  if (structure.bos)   reasons.push('Break of Structure confirmed');
  if (structure.choch) reasons.push('Change of Character detected');

  // ── MTF score (-25 to +25) ────────────────────────────────────
  const mtfScore = mtf.score;
  if (mtf.dominantBias === 'BULLISH' && mtf.alignment >= 80)
    reasons.push(`MTF confluence: ${mtf.bullishCount}/${mtf.signals.length} timeframes bullish`);
  if (mtf.dominantBias === 'BEARISH' && mtf.alignment <= 20)
    reasons.push(`MTF confluence: ${mtf.bearishCount}/${mtf.signals.length} timeframes bearish`);
  if (mtf.dominantBias === 'MIXED')
    reasons.push('MTF divergence — mixed timeframe signals');

  // ── Smart Money score (-15 to +15) ────────────────────────────
  const smcScore = smartMoney.score;
  if (smartMoney.institutionalBias === 'BULLISH') reasons.push('Institutional bias: BULLISH (OBs + FVGs below price)');
  if (smartMoney.institutionalBias === 'BEARISH') reasons.push('Institutional bias: BEARISH (OBs + FVGs above price)');
  if (smartMoney.activeFVG) {
    reasons.push(`Active FVG at $${smartMoney.activeFVG.midpoint.toFixed(2)} (${smartMoney.activeFVG.type})`);
  }

  // ── Pattern score ─────────────────────────────────────────────
  let patternScore = 0;
  if (pattern.pattern !== 'NONE') {
    reasons.push(`Pattern: ${pattern.pattern.replace(/_/g, ' ')} (${pattern.confidence}% conf)`);
    const dirScore = pattern.direction === 'BULLISH' ? 1 : pattern.direction === 'BEARISH' ? -1 : 0;
    patternScore = Math.round(dirScore * (pattern.confidence / 100) * 10); // max ±10
  }

  // ── Correlation score (-10 to +10) ───────────────────────────
  const corrScore = correlations.crossAssetScore;

  // ── Phase 22: Apply adaptive weights (min resolved trades) ───
  const w = weights && weights.sampleSize >= MIN_ADAPT_SAMPLES ? weights : null;
  const wRsi  = w ? Math.round(rsiScore       * w.rsi)       : rsiScore;
  const wMacd = w ? Math.round(macdScore      * w.macd)      : macdScore;
  const wBb   = w ? Math.round(bbScore        * w.bb)        : bbScore;
  const wEma  = w ? Math.round(emaScore       * w.ema)       : emaScore;
  const wStoch = w ? Math.round(stochScore    * w.stoch)     : stochScore;
  const wVol  = w ? Math.round(volumeScore    * w.volume)    : volumeScore;
  const wStr  = w ? Math.round(structureScore * w.structure) : structureScore;
  const wMtf  = w ? Math.round(mtfScore       * w.mtf)       : mtfScore;

  // ── Composite score ────────────────────────────────────────────
  const componentScores: ComponentScores = {
    rsi: wRsi, macd: wMacd, bb: wBb, ema: wEma,
    stoch: wStoch, volume: wVol, structure: wStr, mtf: wMtf,
  };

  const rawScore = wRsi + wMacd + wBb + wEma + wStoch +
    wVol + wStr + wMtf + smcScore + patternScore + corrScore;

  // ── Phase 21: Market Regime multiplier ────────────────────────
  // Signal Quality = Current Setup Quality × Regime Compatibility
  const { adjustedScore, multiplier: regimeMultiplier, note: regimeNote } = applyRegimeMultiplier(rawScore, regime);
  if (regimeNote) reasons.push(`Regime: ${regimeNote}`);
  const finalRegime: MarketRegimeAnalysis = { ...regime, multiplier: regimeMultiplier };

  const score = Math.max(-100, Math.min(100, adjustedScore));

  // ── Preliminary signal classification ─────────────────────────
  let signal: SignalType;
  if (score >= ENHANCED_THRESHOLDS.strong)            signal = 'STRONG_BUY';
  else if (score >= ENHANCED_THRESHOLDS.directional)  signal = 'BUY';
  else if (score <= -ENHANCED_THRESHOLDS.strong)      signal = 'STRONG_SELL';
  else if (score <= -ENHANCED_THRESHOLDS.directional) signal = 'SELL';
  else                                                signal = 'HOLD';

  // ── Institutional-grade STRONG signal gate ─────────────────────
  // STRONG_BUY or STRONG_SELL requires ALL six conditions to be met.
  // If any fail, the signal is downgraded to BUY/SELL and gateFailReasons is populated.
  const gateFailReasons: string[] = [];
  let strongSignalGatePassed = false;

  if (signal === 'STRONG_BUY' || signal === 'STRONG_SELL') {
    const isBull = signal === 'STRONG_BUY';

    // 1. MTF alignment gate — measured in the signal's own direction (BUG-4)
    const mtfAlign = mtfAlignmentFor(mtf, isBull);
    const mtfAligned = mtfAlign >= GATE_MTF_ALIGNMENT;
    if (!mtfAligned) gateFailReasons.push(`MTF alignment ${mtfAlign}% < ${GATE_MTF_ALIGNMENT}%`);

    // 2. Pattern confidence gate (or no pattern detected)
    const patternOk = pattern.pattern === 'NONE' || pattern.confidence >= GATE_PATTERN_CONF;
    if (!patternOk) gateFailReasons.push(`Pattern confidence ${pattern.confidence}% < ${GATE_PATTERN_CONF}%`);

    // 3. Market structure confirms trend direction
    const structureConfirms = isBull
      ? structure.type === 'STRONG_UPTREND' || structure.type === 'WEAK_UPTREND'
      : structure.type === 'STRONG_DOWNTREND' || structure.type === 'WEAK_DOWNTREND';
    if (!structureConfirms) gateFailReasons.push(`Market structure (${structure.type}) does not confirm direction`);

    // 4. Volume confirms breakout
    const volumeConfirms = isBull
      ? volume.confirmation === 'STRONG_BULL' || volume.confirmation === 'BULL'
      : volume.confirmation === 'STRONG_BEAR' || volume.confirmation === 'BEAR';
    if (!volumeConfirms) gateFailReasons.push(`Volume (${volume.confirmation}) does not confirm breakout`);

    // 5. Institutional (Smart Money) bias aligns or is neutral
    const institutionalAligns = isBull
      ? smartMoney.institutionalBias !== 'BEARISH'
      : smartMoney.institutionalBias !== 'BULLISH';
    if (!institutionalAligns) gateFailReasons.push(`Institutional bias (${smartMoney.institutionalBias}) opposes direction`);

    // 6. News risk is acceptable
    if (!newsRisk.isAcceptable) gateFailReasons.push(`News risk ${newsRisk.riskLevel} — ${newsRisk.tradingRecommendation}`);

    if (gateFailReasons.length === 0) {
      strongSignalGatePassed = true;
    } else {
      signal = isBull ? 'BUY' : 'SELL';
      reasons.push(`⚠ STRONG signal downgraded — gate failed: ${gateFailReasons.join(' | ')}`);
    }
  }

  // ── NO_TRADE: news risk extreme overrides everything ──────────
  if (newsRisk.riskLevel === 'EXTREME') {
    signal = 'NO_TRADE';
    reasons.push(`NO TRADE — News risk EXTREME: ${newsRisk.upcomingEvents[0]}`);
  }

  // ── Session notes ──────────────────────────────────────────────
  if (session.impact === 'LOW') reasons.push(`Low-liquidity session (${session.currentSession}) — reduce position size`);

  // ── Pattern direction mismatch warning ────────────────────────
  if (pattern.pattern !== 'NONE') {
    const patternBullish = pattern.direction === 'BULLISH';
    const signalBullish  = signal === 'STRONG_BUY' || signal === 'BUY';
    const signalBearish  = signal === 'STRONG_SELL' || signal === 'SELL';
    if ((patternBullish && signalBearish) || (!patternBullish && pattern.direction === 'BEARISH' && signalBullish)) {
      reasons.push(`⚠ Pattern direction (${pattern.direction}) conflicts with signal`);
    }
  }

  // ── Dynamic confidence (Phase 4 + new factors) ────────────────
  const confidence = calculateDynamicConfidence(score, mtf, volume, structure, volatility, ind, pattern, session, newsRisk, smartMoney, finalRegime);

  // ── Dynamic risk metrics (Phase 6) ────────────────────────────
  const riskMetrics = calculateRiskMetrics(price, signal, ind, structure, volatility, score);

  return {
    signal,
    confidence,
    score,
    entryPrice:  price,
    stopLoss:    riskMetrics.stopLoss,
    takeProfit:  riskMetrics.takeProfit,
    reasons,
    volumeAnalysis:  volume,
    marketStructure: structure,
    volatility,
    mtfAnalysis:     mtf,
    riskMetrics,
    componentScores,
    volumeProfile,
    sessionAnalysis:  session,
    patternResult:    pattern,
    smartMoney,
    newsRisk,
    correlations,
    marketRegime:    finalRegime,
    strongSignalGatePassed,
    gateFailReasons,
  };
}
