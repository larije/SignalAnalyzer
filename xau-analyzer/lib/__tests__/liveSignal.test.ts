import { describe, it, expect } from 'vitest';
import { lastClosedCandle, closedCandles, isStale, closeTimeOf, shouldRecordSignal } from '../liveSignal';
import type { Candle } from '../technicalAnalysis';

function c(time: number, close: number): Candle {
  return { time, open: close, high: close, low: close, close, volume: 1 };
}

describe('non-repainting helpers', () => {
  it('lastClosedCandle returns the second-to-last (last is still forming)', () => {
    const candles = [c(1, 100), c(2, 101), c(3, 102)];
    expect(lastClosedCandle(candles)?.time).toBe(2);
    expect(lastClosedCandle(candles)?.close).toBe(101);
  });

  it('lastClosedCandle is null with fewer than 2 candles', () => {
    expect(lastClosedCandle([c(1, 100)])).toBeNull();
    expect(lastClosedCandle([])).toBeNull();
  });

  it('closedCandles drops the forming candle', () => {
    const candles = [c(1, 100), c(2, 101), c(3, 102)];
    expect(closedCandles(candles).map(x => x.time)).toEqual([1, 2]);
  });
});

describe('isStale', () => {
  it('is false when the last candle is recent', () => {
    expect(isStale(1_000, 1_000 + 10_000)).toBe(false);
  });
  it('is true past the max age', () => {
    expect(isStale(1_000, 1_000 + 91_000)).toBe(true);
  });
});

describe('shouldRecordSignal — never record from stale data (BUG-6)', () => {
  it('records an actionable signal on fresh data', () => {
    expect(shouldRecordSignal(false, 'BUY')).toBe(true);
    expect(shouldRecordSignal(false, 'STRONG_SELL')).toBe(true);
  });
  it('never records anything when the data is stale', () => {
    expect(shouldRecordSignal(true, 'BUY')).toBe(false);
    expect(shouldRecordSignal(true, 'STRONG_SELL')).toBe(false);
  });
  it('does not record non-actionable signals', () => {
    expect(shouldRecordSignal(false, 'HOLD')).toBe(false);
    expect(shouldRecordSignal(false, 'NO_TRADE')).toBe(false);
  });
});

describe('closeTimeOf — staleness measured from candle CLOSE, not open (BUG-5)', () => {
  it('derives the 1m candle close time from its open time', () => {
    expect(closeTimeOf(1_000)).toBe(61_000);
  });

  it('a signal 40s after the candle closed is NOT stale, even though the open time is ~100s old', () => {
    const openTime = 0;             // candle opened at 0, closed at 60_000
    const now = 100_000;            // 100s after open = 40s after close
    expect(isStale(closeTimeOf(openTime), now)).toBe(false);
  });

  it('a signal is stale once more than 90s have passed since the candle closed', () => {
    const openTime = 0;
    const now = 160_000;            // 100s after close
    expect(isStale(closeTimeOf(openTime), now)).toBe(true);
  });
});
