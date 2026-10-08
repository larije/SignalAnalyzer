import { describe, it, expect, beforeEach } from 'vitest';
import { SignalHistoryStore } from '../signalHistory';
import type { SimBar } from '../backtestEngine';

let s: SignalHistoryStore;
beforeEach(() => { s = new SignalHistoryStore(); });

// A closed candle to resolve against. high/low decide WIN/LOSS, not close alone.
const bar = (high: number, low: number, close: number, time = 1): SimBar => ({ high, low, close, time });

describe('honest win definition', () => {
  it('WIN only when TP is reached', () => {
    s.record('BTC', 'BUY', 30, 60, 100, 98, 104);
    s.resolvePending('BTC', bar(104, 100, 104), 1_000); // high reaches TP
    expect(s.getHistory('BTC')[0].outcome).toBe('WIN');
  });

  it('LOSS only when stop is reached', () => {
    s.record('BTC', 'BUY', 30, 60, 100, 98, 104);
    s.resolvePending('BTC', bar(100, 98, 98), 1_000); // low reaches stop
    expect(s.getHistory('BTC')[0].outcome).toBe('LOSS');
  });

  it('books a LOSS on a wick that pierces the stop even if the candle closes back above it (BUG-2)', () => {
    s.record('BTC', 'BUY', 30, 60, 100, 98, 104);
    s.resolvePending('BTC', bar(101, 97.5, 100.2), 1_000); // low pierced 98, closed at 100.2
    expect(s.getHistory('BTC')[0].outcome).toBe('LOSS');   // close-only logic wrongly left this PENDING
  });

  it('tiny drift after 60m is TIMEOUT, not WIN', () => {
    s.record('BTC', 'BUY', 30, 60, 100, 98, 104, 0); // entry at t=0
    s.resolvePending('BTC', bar(100.01, 99.99, 100.01), 61 * 60_000); // aged out, no touch
    expect(s.getHistory('BTC')[0].outcome).toBe('TIMEOUT');
  });

  it('winRate excludes timeouts', () => {
    s.record('BTC', 'BUY', 30, 60, 100, 98, 104); s.resolvePending('BTC', bar(104, 100, 104), 1_000);              // WIN
    s.record('BTC', 'SELL', -30, 60, 100, 102, 96); s.resolvePending('BTC', bar(102, 100, 101), 1_000);            // LOSS (short stopped)
    s.record('BTC', 'BUY', 30, 60, 100, 98, 104, 0); s.resolvePending('BTC', bar(100.01, 99.99, 100.01), 61 * 60_000); // TIMEOUT
    const stats = s.getStats('BTC');
    expect(stats.winRate).toBeCloseTo(0.5, 5);
    expect(stats.timeouts).toBe(1);
  });
});

describe('de-duplication', () => {
  it('does not double-record the same open setup', () => {
    s.record('BTC', 'BUY', 30, 60, 100, 98, 104);
    s.record('BTC', 'BUY', 30, 60, 100, 98, 104); // duplicate while first still PENDING
    expect(s.getHistory('BTC').length).toBe(1);
  });

  it('records again after a direction flip', () => {
    s.record('BTC', 'BUY', 30, 60, 100, 98, 104);
    s.record('BTC', 'SELL', -30, 60, 100, 102, 96);
    expect(s.getHistory('BTC').length).toBe(2);
  });

  it('records again after the prior setup resolves', () => {
    s.record('BTC', 'BUY', 30, 60, 100, 98, 104);
    s.resolvePending('BTC', bar(104, 100, 104), 1_000); // WIN — no longer PENDING
    s.record('BTC', 'BUY', 30, 60, 100, 98, 104);
    expect(s.getHistory('BTC').length).toBe(2);
  });
});
