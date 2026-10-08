import { describe, it, expect } from 'vitest';
import { generateSignal } from '../signalEngine';
import type { Indicators } from '../technicalAnalysis';

/** A neutral Indicators fixture; only the MACD block matters for these tests. */
function indWith(macd: Indicators['macd']): Indicators {
  return {
    rsi: 50,
    macd,
    bb: { upper: 110, middle: 100, lower: 90, width: 20 },
    ema9: 100, ema21: 100, ema50: 100, ema200: null,
    atr: 1,
    stoch: { k: 50, d: 50 },
    volume: 10, volumeMA: 10, relativeVolume: 1,
  };
}

describe('generateSignal MACD scoring (BUG-1: crossover tautology)', () => {
  it('does not report a crossover when the histogram has merely stayed positive', () => {
    const r = generateSignal(100, indWith({ value: 5, signal: 3, histogram: 2, prevHistogram: 1 }));
    expect(r.reasons).not.toContain('MACD bullish crossover');
  });

  it('reports a bullish crossover only when the histogram flips negative -> positive', () => {
    const r = generateSignal(100, indWith({ value: 5, signal: 3, histogram: 2, prevHistogram: -1 }));
    expect(r.reasons).toContain('MACD bullish crossover');
  });

  it('does not report a crossover when the histogram has merely stayed negative', () => {
    const r = generateSignal(100, indWith({ value: 1, signal: 3, histogram: -2, prevHistogram: -1 }));
    expect(r.reasons).not.toContain('MACD bearish crossover');
  });
});
