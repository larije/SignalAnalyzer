// Phase 2 — Volume Confirmation Engine
import type { Candle } from './technicalAnalysis';
import type { VolumeAnalysis } from './types';

export function analyzeVolume(candles: Candle[], lookback = 20): VolumeAnalysis {
  if (candles.length < lookback + 2) {
    return {
      current: 0, average: 0, ratio: 1, trend: 'NEUTRAL',
      spike: false, confirmation: 'NEUTRAL', score: 0,
    };
  }

  const volumes = candles.map(c => c.volume);
  const current = volumes[volumes.length - 1];

  // 20-period average (excluding current bar)
  const lookbackVols = volumes.slice(-lookback - 1, -1);
  const average = lookbackVols.reduce((a, b) => a + b, 0) / lookbackVols.length;
  const ratio = average > 0 ? current / average : 1;

  // Volume trend: compare last-5 avg vs prior-5 avg
  const last5  = volumes.slice(-6, -1).reduce((a, b) => a + b, 0) / 5;
  const prev5  = volumes.slice(-11, -6).reduce((a, b) => a + b, 0) / 5;
  const trend  = prev5 > 0
    ? last5 > prev5 * 1.15 ? 'RISING'
    : last5 < prev5 * 0.85 ? 'FALLING'
    : 'NEUTRAL'
    : 'NEUTRAL';

  const spike = ratio > 2.0;

  // Price direction of the current bar for directional confirmation
  const bar = candles[candles.length - 1];
  const bullishBar = bar.close > bar.open;

  // Classify confirmation and assign score (-15 to +15)
  let score = 0;
  let confirmation: VolumeAnalysis['confirmation'];

  if (ratio >= 1.5 && bullishBar) {
    confirmation = 'STRONG_BULL'; score = 15;
  } else if (ratio >= 1.2 && bullishBar) {
    confirmation = 'BULL'; score = 8;
  } else if (ratio >= 1.5 && !bullishBar) {
    confirmation = 'STRONG_BEAR'; score = -15;
  } else if (ratio >= 1.2 && !bullishBar) {
    confirmation = 'BEAR'; score = -8;
  } else if (ratio < 0.6) {
    // Low volume: move is unconvincing regardless of direction
    confirmation = 'NEUTRAL'; score = -5;
  } else {
    confirmation = 'NEUTRAL'; score = 0;
  }

  // Trend reinforcement bonus
  if (trend === 'RISING' && score > 0)  score = Math.min(15, score + 3);
  if (trend === 'RISING' && score < 0)  score = Math.max(-15, score - 3);
  if (trend === 'FALLING' && Math.abs(score) < 5) score -= 2;

  return { current, average, ratio, trend, spike, confirmation, score };
}

/** Human-readable volume strength label */
export function volumeStrengthLabel(ratio: number): string {
  if (ratio >= 2.5)  return 'EXTREME';
  if (ratio >= 1.75) return 'VERY HIGH';
  if (ratio >= 1.3)  return 'HIGH';
  if (ratio >= 0.9)  return 'NORMAL';
  if (ratio >= 0.6)  return 'LOW';
  return 'VERY LOW';
}
