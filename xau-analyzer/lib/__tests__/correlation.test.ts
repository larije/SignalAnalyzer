import { describe, it, expect } from 'vitest';
import { pearsonReturns } from '../correlationAnalysis';

describe('pearsonReturns', () => {
  it('perfectly correlated moves -> ~1', () => {
    const a = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110];
    const b = a.map(x => x * 2);
    expect(pearsonReturns(a, b)).toBeGreaterThan(0.99);
  });
  it('opposite moves -> ~ -1', () => {
    const a = [100, 101, 102, 101, 102, 103, 102, 103, 104, 103, 104];
    const b = a.map((_, i, arr) => 200 - arr[i]);
    expect(pearsonReturns(a, b)).toBeLessThan(-0.9);
  });
  it('too few points -> 0', () => {
    expect(pearsonReturns([1, 2], [2, 3])).toBe(0);
  });
});
