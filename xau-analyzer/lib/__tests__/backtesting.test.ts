import { describe, it, expect } from 'vitest';
import { simulate, type SignalFn } from '../backtesting';
import type { Candle } from '../technicalAnalysis';

const noCosts = { feePct: 0, spreadPct: 0, slippagePct: 0 };

function flat(n: number, price = 100): Candle[] {
  return Array.from({ length: n }, (_, i) => ({ time: i * 60_000, open: price, high: price, low: price, close: price, volume: 10 }));
}

// Fire a BUY exactly once, at the bar where the window first has `len` candles (i = len-1).
function buyAt(len: number, stop: number, target: number): SignalFn {
  return (window) => window.length === len
    ? { signal: 'BUY', stopLoss: stop, takeProfit: target, score: 40 }
    : { signal: 'HOLD', stopLoss: 0, takeProfit: 0, score: 0 };
}

describe('simulate', () => {
  it('opens on the signal bar and exits on the NEXT bar (off-by-one fixed) as a WIN', () => {
    const candles = flat(200, 100);
    candles[61] = { ...candles[61], high: 105 }; // bar right after entry spikes to target
    const result = simulate(candles, '1h', 'BTC', '30d', noCosts, buyAt(61, 98, 104));

    expect(result.totalTrades).toBe(1);
    expect(result.trades[0].outcome).toBe('WIN');
    expect(result.trades[0].entryPrice).toBe(100);
    expect(result.trades[0].holdMinutes).toBe(60); // 1 bar * 60 min
    expect(result.winRate).toBe(1);
    expect(Number.isFinite(result.sharpeRatio)).toBe(true);
  });

  it('books a TIMEOUT (not a win) when neither stop nor target is hit within max hold', () => {
    const candles = flat(200, 100); // never moves
    const result = simulate(candles, '1h', 'BTC', '30d', noCosts, buyAt(61, 90, 110));

    expect(result.totalTrades).toBe(1);
    expect(result.trades[0].outcome).toBe('TIMEOUT');
    expect(result.timeouts).toBe(1);
    expect(result.winRate).toBe(0); // timeouts excluded from win rate
  });

  it('times out after the same 60-minute window as live signals, not 24 hours (BUG-9)', () => {
    const candles = flat(200, 100); // never moves → will time out
    const r = simulate(candles, '1h', 'BTC', '30d', noCosts, buyAt(61, 90, 110));
    expect(r.trades[0].outcome).toBe('TIMEOUT');
    expect(r.trades[0].holdMinutes).toBe(60); // live times out at 60 min; was 1440 (24h)
  });

  it('keeps wins + losses + timeouts === totalTrades', () => {
    const candles = flat(200, 100);
    candles[61] = { ...candles[61], high: 105 };
    const r = simulate(candles, '1h', 'BTC', '30d', noCosts, buyAt(61, 98, 104));
    expect(r.wins + r.losses + r.timeouts).toBe(r.totalTrades);
  });
});
