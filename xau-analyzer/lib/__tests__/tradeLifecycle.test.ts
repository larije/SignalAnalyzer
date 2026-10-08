import { describe, it, expect } from 'vitest';
import { resolveTrade, signalSide, type PendingTrade } from '../tradeLifecycle';

const noCosts = { feePct: 0, spreadPct: 0, slippagePct: 0 };
const longTrade: PendingTrade  = { signal: 'BUY',  entryPrice: 100, stopLoss: 98,  takeProfit: 104, timestamp: 0 };
const shortTrade: PendingTrade = { signal: 'SELL', entryPrice: 100, stopLoss: 102, takeProfit: 96,  timestamp: 0 };

describe('signalSide', () => {
  it('maps BUY/STRONG_BUY to LONG and SELL/STRONG_SELL to SHORT', () => {
    expect(signalSide('BUY')).toBe('LONG');
    expect(signalSide('STRONG_BUY')).toBe('LONG');
    expect(signalSide('SELL')).toBe('SHORT');
    expect(signalSide('STRONG_SELL')).toBe('SHORT');
    expect(signalSide('HOLD')).toBe('NONE');
  });
});

describe('resolveTrade — bar-aware, matches the backtester (BUG-2)', () => {
  it('books a WIN when the candle HIGH reaches the target even if it closes below (wick)', () => {
    // close 100.5 never reached TP 104, but the high pierced it — close-only logic missed this
    const r = resolveTrade(longTrade, { high: 104.2, low: 100, close: 100.5, time: 1 }, 60_000, { costs: noCosts });
    expect(r?.outcome).toBe('WIN');
    expect(r?.exitPrice).toBe(104); // filled at the target level, not the close
  });

  it('books a LOSS when the candle LOW pierces the stop then closes back above (wick stop-out)', () => {
    const r = resolveTrade(longTrade, { high: 101, low: 97.5, close: 100.2, time: 1 }, 60_000, { costs: noCosts });
    expect(r?.outcome).toBe('LOSS');
    expect(r?.exitPrice).toBe(98);
  });

  it('books both-touch bars as LOSS (pessimistic, matching the backtester)', () => {
    const r = resolveTrade(longTrade, { high: 105, low: 97, close: 101, time: 1 }, 60_000, { costs: noCosts });
    expect(r?.outcome).toBe('LOSS');
  });

  it('subtracts trading costs from the realised pnl of a win', () => {
    const r = resolveTrade(longTrade, { high: 104, low: 100, close: 104, time: 1 }, 60_000); // default live costs
    expect(r?.outcome).toBe('WIN');
    expect(r?.pnlPct).toBeCloseTo(3.85, 4); // 4% gross - 0.15% round-trip costs
  });

  it('times out (never a win) after the hold window with no touch', () => {
    const r = resolveTrade(longTrade, { high: 101, low: 99.99, close: 100.01, time: 1 }, 61 * 60_000, { costs: noCosts });
    expect(r?.outcome).toBe('TIMEOUT');
  });

  it('stays open (null) before any touch or timeout', () => {
    const r = resolveTrade(longTrade, { high: 103, low: 99, close: 101, time: 1 }, 60_000, { costs: noCosts });
    expect(r).toBeNull();
  });

  it('resolves the short side against the stop above entry', () => {
    const r = resolveTrade(shortTrade, { high: 102.5, low: 100, close: 101, time: 1 }, 60_000, { costs: noCosts });
    expect(r?.outcome).toBe('LOSS'); // short stop at 102 pierced by the high
    expect(r?.exitPrice).toBe(102);
  });
});
