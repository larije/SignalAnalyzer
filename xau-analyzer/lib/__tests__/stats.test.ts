import { describe, it, expect } from 'vitest';
import { computeAvgRR, perTradeSharpe } from '../signalHistory';

describe('computeAvgRR', () => {
  it('is avg win / avg loss magnitude', () => {
    expect(computeAvgRR([{ pnlPct: 2 }, { pnlPct: 4 }], [{ pnlPct: -1 }, { pnlPct: -3 }])).toBeCloseTo(1.5, 5);
  });
  it('is 0 when no losses', () => {
    expect(computeAvgRR([{ pnlPct: 2 }], [])).toBe(0);
  });
  it('is finite always', () => {
    expect(Number.isFinite(computeAvgRR([{ pnlPct: 1 }], [{ pnlPct: -1 }]))).toBe(true);
  });
});

describe('perTradeSharpe', () => {
  it('is mean/std, no annualization', () => {
    expect(perTradeSharpe([1, -1, 1, -1])).toBe(0); // mean 0 -> 0
  });
  it('is 0 for zero variance', () => {
    expect(perTradeSharpe([2, 2, 2])).toBe(0);
  });
  it('is positive when returns are net positive', () => {
    expect(perTradeSharpe([1, 2, 1, 2])).toBeGreaterThan(0);
  });
});
