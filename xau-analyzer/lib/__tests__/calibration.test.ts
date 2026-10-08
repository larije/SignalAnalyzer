import { describe, it, expect } from 'vitest';
import { CalibrationStore, confidenceLabel, showNumericConfidence } from '../confidenceCalibration';

describe('confidenceLabel', () => {
  it('labels by band', () => {
    expect(confidenceLabel(20)).toBe('Weak');
    expect(confidenceLabel(55)).toBe('Medium');
    expect(confidenceLabel(80)).toBe('Strong');
  });
});

describe('CalibrationStore', () => {
  it('hides numeric confidence until 30 resolved', () => {
    const s = new CalibrationStore();
    for (let i = 0; i < 29; i++) s.add(70, true);
    expect(showNumericConfidence(s)).toBe(false);
    s.add(70, true);
    expect(showNumericConfidence(s)).toBe(true);
  });

  it('realized win rate is null until 10 in the bucket', () => {
    const s = new CalibrationStore();
    for (let i = 0; i < 9; i++) s.add(70, i % 2 === 0);
    expect(s.realizedWinRate(70)).toBeNull();
    s.add(70, true);
    expect(s.realizedWinRate(70)).not.toBeNull();
  });

  it('computes the realized win rate for a bucket', () => {
    const s = new CalibrationStore();
    for (let i = 0; i < 10; i++) s.add(72, i < 6); // 6 wins of 10 in the 70-79 bucket
    expect(s.realizedWinRate(75)).toBeCloseTo(0.6, 5);
  });
});
