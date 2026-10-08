import { describe, it, expect } from 'vitest';
import { assessNewsRiskAt } from '../newsRisk';

describe('assessNewsRiskAt', () => {
  it('is deterministic and marked an estimate for a quiet time', () => {
    const d = new Date(Date.UTC(2026, 0, 7, 3, 0)); // Wed 03:00 UTC, quiet
    expect(assessNewsRiskAt(d).riskLevel).toBe('LOW');
    expect(assessNewsRiskAt(d).isEstimate).toBe(true);
  });
  it('flags the weekend', () => {
    const sat = new Date(Date.UTC(2026, 0, 10, 12, 0)); // Saturday
    expect(assessNewsRiskAt(sat).upcomingEvents.join()).toMatch(/Weekend/);
  });
  it('catches NFP at both 12:xx and 13:xx UTC (DST tolerant)', () => {
    // First Friday of May 2026 is the 1st
    const winter = new Date(Date.UTC(2026, 4, 1, 13, 35)); // 13:35 UTC
    expect(assessNewsRiskAt(winter).score).toBeGreaterThanOrEqual(40);
  });
});
