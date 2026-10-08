import { describe, it, expect } from 'vitest';
import { analyzeSessionAt } from '../sessionAnalysis';

describe('analyzeSessionAt', () => {
  it('detects the London/NY overlap at 14:00 UTC', () => {
    expect(analyzeSessionAt(new Date(Date.UTC(2026, 0, 7, 14, 0)), []).currentSession).toBe('LONDON_NY_OVERLAP');
  });
  it('detects the Asian session at 03:00 UTC', () => {
    expect(analyzeSessionAt(new Date(Date.UTC(2026, 0, 7, 3, 0)), []).currentSession).toBe('ASIAN');
  });
  it('detects off-hours at 22:00 UTC', () => {
    expect(analyzeSessionAt(new Date(Date.UTC(2026, 0, 7, 22, 0)), []).currentSession).toBe('OFF_HOURS');
  });
});
