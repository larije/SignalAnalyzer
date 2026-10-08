import { describe, it, expect } from 'vitest';
import { calculateIndicators, macdCross } from '../technicalAnalysis';
import type { Candle } from '../technicalAnalysis';

function mk(n: number): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    time: i,
    open: 100 + i * 0.1,
    high: 100 + i * 0.1 + 0.2,
    low: 100 + i * 0.1 - 0.2,
    close: 100 + i * 0.1,
    volume: 10,
  }));
}

describe('ema200 honesty', () => {
  it('is null when < 200 candles', () => {
    expect(calculateIndicators(mk(120))!.ema200).toBeNull();
  });
  it('is a number when >= 200 candles', () => {
    expect(typeof calculateIndicators(mk(220))!.ema200).toBe('number');
  });
});

describe('macdCross (BUG-1: real cross vs sustained momentum)', () => {
  it('classifies a fresh cross up (histogram flips negative -> positive) as BULL_CROSS', () => {
    expect(macdCross({ histogram: 2, prevHistogram: -1 })).toBe('BULL_CROSS');
  });
  it('classifies a sustained positive histogram as BULL momentum, not a cross', () => {
    expect(macdCross({ histogram: 2, prevHistogram: 1 })).toBe('BULL');
  });
  it('classifies a fresh cross down (histogram flips positive -> negative) as BEAR_CROSS', () => {
    expect(macdCross({ histogram: -2, prevHistogram: 1 })).toBe('BEAR_CROSS');
  });
  it('classifies a sustained negative histogram as BEAR momentum, not a cross', () => {
    expect(macdCross({ histogram: -2, prevHistogram: -1 })).toBe('BEAR');
  });
});

describe('calculateIndicators reports prevHistogram (BUG-1)', () => {
  it('exposes the previous bar histogram so a real MACD cross can be detected', () => {
    expect(typeof calculateIndicators(mk(120))!.macd.prevHistogram).toBe('number');
  });
});
