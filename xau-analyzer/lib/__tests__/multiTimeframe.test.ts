import { describe, it, expect } from 'vitest';
import { mtfAlignmentFor, closedOnly } from '../multiTimeframe';
import type { MultiTimeframeAnalysis, TimeframeSignal } from '../types';
import type { Candle } from '../technicalAnalysis';

const cc = (time: number): Candle => ({ time, open: 1, high: 1, low: 1, close: 1, volume: 1 });

describe('closedOnly (BUG-8: HTF was scored including the still-forming candle)', () => {
  it('drops the last (still-forming) candle', () => {
    expect(closedOnly([cc(1), cc(2), cc(3)]).map(c => c.time)).toEqual([1, 2]);
  });
  it('is safe on an empty array', () => {
    expect(closedOnly([])).toEqual([]);
  });
});

const mtf = (bullishCount: number, bearishCount: number, len: number): MultiTimeframeAnalysis => ({
  signals: Array.from({ length: len }, () => ({} as TimeframeSignal)),
  bullishCount,
  bearishCount,
  neutralCount: len - bullishCount - bearishCount,
  alignment: Math.round((bullishCount / len) * 100), // bullish share, as the app defines it
  confidence: 0,
  dominantBias: 'MIXED',
  score: 0,
});

describe('mtfAlignmentFor (BUG-4: STRONG gate counted HOLD timeframes as bearish)', () => {
  it('returns the bullish share for a long signal', () => {
    expect(mtfAlignmentFor(mtf(4, 0, 5), true)).toBe(80);
  });

  it('returns the BEARISH share for a short, not (100 - bullish share)', () => {
    // 1 SELL + 4 HOLD: only 20% of timeframes are bearish, but (100 - alignment) would claim 100%.
    expect(mtfAlignmentFor(mtf(0, 1, 5), false)).toBe(20);
  });

  it('confirms a short only when most timeframes are genuinely bearish', () => {
    expect(mtfAlignmentFor(mtf(0, 4, 5), false)).toBe(80);
  });
});
