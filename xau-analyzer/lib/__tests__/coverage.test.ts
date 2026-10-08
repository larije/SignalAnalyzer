import { describe, it, expect } from 'vitest';
import { analyzeVolume } from '../volumeAnalysis';
import { detectMarketStructure } from '../marketStructure';
import type { Candle } from '../technicalAnalysis';

function series(n: number, fn: (i: number) => Partial<Candle>): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    time: i * 60_000, open: 100, high: 101, low: 99, close: 100, volume: 100, ...fn(i),
  }));
}

describe('analyzeVolume', () => {
  it('flags a high-volume bullish bar as a spike / strong-bull confirmation', () => {
    const candles = series(25, i => (i === 24 ? { volume: 300, open: 100, close: 101 } : {}));
    const v = analyzeVolume(candles);
    expect(v.ratio).toBeGreaterThan(2);
    expect(v.spike).toBe(true);
    expect(v.confirmation).toBe('STRONG_BULL');
    expect(v.score).toBeGreaterThan(0);
  });

  it('treats a very low-volume bar as unconvincing (neutral, non-positive score)', () => {
    const candles = series(25, i => (i === 24 ? { volume: 10, open: 100, close: 99 } : {}));
    const v = analyzeVolume(candles);
    expect(v.ratio).toBeLessThan(0.6);
    expect(v.confirmation).toBe('NEUTRAL');
    expect(v.score).toBeLessThanOrEqual(0);
  });
});

describe('detectMarketStructure', () => {
  it('keeps outputs within valid bounds on a clean uptrend', () => {
    const up = series(50, i => ({ high: 100 + i + 1, low: 100 + i - 1, close: 100 + i, open: 100 + i - 0.5 }));
    const ms = detectMarketStructure(up);
    expect(ms.swingHigh).toBeGreaterThanOrEqual(ms.swingLow);
    expect(ms.score).toBeGreaterThanOrEqual(-20);
    expect(ms.score).toBeLessThanOrEqual(20);
    expect(ms.strength).toBeGreaterThanOrEqual(0);
    expect(ms.strength).toBeLessThanOrEqual(100);
    expect(ms.type).not.toBe('STRONG_DOWNTREND'); // a rising series is not a strong downtrend
  });
});
