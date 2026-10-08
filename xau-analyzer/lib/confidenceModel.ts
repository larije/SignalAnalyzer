// Dynamic Multi-Factor Confidence Model (0–100) — Phase 4 + institutional extensions
import type { Indicators } from './technicalAnalysis';
import type {
  MultiTimeframeAnalysis, VolumeAnalysis,
  MarketStructure, VolatilityAnalysis,
  PatternResult, SessionAnalysis, NewsRiskAssessment, SmartMoneyAnalysis,
  MarketRegimeAnalysis,
} from './types';

export function calculateDynamicConfidence(
  baseScore: number,
  mtf: MultiTimeframeAnalysis,
  volume: VolumeAnalysis,
  structure: MarketStructure,
  volatility: VolatilityAnalysis,
  ind: Indicators,
  pattern?: PatternResult,
  session?: SessionAnalysis,
  newsRisk?: NewsRiskAssessment,
  smartMoney?: SmartMoneyAnalysis,
  regime?: MarketRegimeAnalysis,
): number {
  // 1. Base: normalize raw score to 0-50 points
  let conf = Math.min(50, Math.abs(baseScore) * 0.50);

  // 2. MTF alignment: up to +20 points — must be measured in the signal's OWN
  // direction. mtf.alignment is the BULLISH share (100 = all bullish), so a short
  // signal is confirmed when alignment is LOW; crediting raw alignment inverted
  // every short's confidence (BUG-3).
  const dirAlignment = baseScore >= 0 ? mtf.alignment : 100 - mtf.alignment;
  conf += (dirAlignment / 100) * 20;

  // 3. Volume confirmation: up to +8 points
  conf += Math.min(8, Math.max(0, (volume.ratio - 1) * 8));

  // 4. Market structure strength: up to +12 points
  conf += (structure.strength / 100) * 12;

  // 5. Volatility regime adjustment: -10 to +5
  conf += volatility.confidenceAdj;

  // 6. Indicator agreement bonus: up to +6 points
  // MACD must AGREE with the signal direction to count. The old `|histogram| > 0`
  // check credited any non-zero histogram, so it fired on almost every bar
  // regardless of direction (a MACD-tautology of the BUG-3 class).
  const extremeRSI   = ind.rsi < 35 || ind.rsi > 65 ? 2 : 0;
  const macdAgrees   = (baseScore >= 0 ? ind.macd.histogram > 0 : ind.macd.histogram < 0) ? 2 : 0;
  const stochExtreme = ind.stoch.k < 25 || ind.stoch.k > 75 ? 2 : 0;
  conf += extremeRSI + macdAgrees + stochExtreme;

  // 7. BOS: +4 | CHOCH: -6
  if (structure.bos)   conf += 4;
  if (structure.choch) conf -= 6;

  // 8. Pattern recognition: up to +8 points
  if (pattern && pattern.pattern !== 'NONE') {
    conf += (pattern.confidence / 100) * 8;
  }

  // 9. Session impact: -8 to +10
  if (session) conf += session.confidenceAdj;

  // 10. News risk penalty: -20 to 0
  if (newsRisk) conf += newsRisk.confidenceAdj;

  // 11. Smart Money Concepts: up to +5 points
  if (smartMoney) {
    const smcBonus = Math.max(0, smartMoney.score) * 0.33; // only positive SMC boosts confidence
    conf += Math.min(5, smcBonus);
  }

  // 12. Market Regime compatibility: -12 to +8
  if (regime) {
    const isScoreBull = baseScore > 0;
    switch (regime.regime) {
      case 'TRENDING': {
        const aligned = (isScoreBull && regime.direction === 'BULLISH') ||
                        (!isScoreBull && regime.direction === 'BEARISH');
        conf += aligned ? 8 : -12;
        break;
      }
      case 'EXPANSION': {
        const aligned = regime.direction === 'NEUTRAL' ||
                        (isScoreBull && regime.direction === 'BULLISH') ||
                        (!isScoreBull && regime.direction === 'BEARISH');
        conf += aligned ? 6 : -10;
        break;
      }
      case 'REVERSAL': {
        const aligned = (isScoreBull && regime.direction === 'BULLISH') ||
                        (!isScoreBull && regime.direction === 'BEARISH');
        conf += aligned ? 5 : -9;
        break;
      }
      case 'RANGING':
        conf -= 5;
        break;
      case 'COMPRESSION':
        conf -= 8;
        break;
    }
  }

  return Math.round(Math.max(5, Math.min(99, conf)));
}
