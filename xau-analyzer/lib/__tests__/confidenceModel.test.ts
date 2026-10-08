import { describe, it, expect } from 'vitest';
import { calculateDynamicConfidence } from '../confidenceModel';
import type { Indicators } from '../technicalAnalysis';
import type { MultiTimeframeAnalysis, VolumeAnalysis, MarketStructure, VolatilityAnalysis } from '../types';

// Minimal fixtures — only the fields calculateDynamicConfidence reads are set.
const mtf = (alignment: number): MultiTimeframeAnalysis => ({
  signals: [], bullishCount: 0, bearishCount: 0, neutralCount: 0,
  alignment, confidence: 0, dominantBias: 'MIXED', score: 0,
});
const volume = { ratio: 1 } as unknown as VolumeAnalysis;
const structure = { strength: 0, bos: false, choch: false } as unknown as MarketStructure;
const volatility = { confidenceAdj: 0 } as unknown as VolatilityAnalysis;
const ind = (histogram: number): Indicators => ({
  rsi: 50,
  macd: { value: 0, signal: 0, histogram, prevHistogram: 0 },
  bb: { upper: 110, middle: 100, lower: 90, width: 20 },
  ema9: 100, ema21: 100, ema50: 100, ema200: null,
  atr: 1, stoch: { k: 50, d: 50 },
  volume: 10, volumeMA: 10, relativeVolume: 1,
});

describe('calculateDynamicConfidence — MTF alignment is directional (BUG-3)', () => {
  it('gives a bearish signal more confidence when timeframes are bearish than when they oppose it', () => {
    const confirmed   = calculateDynamicConfidence(-50, mtf(0),   volume, structure, volatility, ind(0)); // 0% bull = all bearish
    const contradicted = calculateDynamicConfidence(-50, mtf(100), volume, structure, volatility, ind(0)); // 100% bull, opposes the short
    expect(confirmed).toBeGreaterThan(contradicted);
  });

  it('still gives a bullish signal more confidence when timeframes are bullish', () => {
    const confirmed   = calculateDynamicConfidence(50, mtf(100), volume, structure, volatility, ind(0));
    const contradicted = calculateDynamicConfidence(50, mtf(0),   volume, structure, volatility, ind(0));
    expect(confirmed).toBeGreaterThan(contradicted);
  });
});

describe('calculateDynamicConfidence — MACD agreement bonus is directional (BUG-3)', () => {
  it('does not credit MACD momentum that opposes the signal direction', () => {
    const agrees  = calculateDynamicConfidence(50, mtf(50), volume, structure, volatility, ind(1));  // bullish signal, up momentum
    const opposes = calculateDynamicConfidence(50, mtf(50), volume, structure, volatility, ind(-1)); // bullish signal, down momentum
    expect(agrees).toBeGreaterThan(opposes);
  });
});
