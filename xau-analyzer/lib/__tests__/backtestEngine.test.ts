import { describe, it, expect } from 'vitest';
import { evalBarExit, type OpenTrade } from '../backtestEngine';

const noCosts = { feePct: 0, spreadPct: 0, slippagePct: 0 };
const long: OpenTrade = { dir: 'LONG', entry: 100, stop: 98, target: 104, entryTime: 0 };
const short: OpenTrade = { dir: 'SHORT', entry: 100, stop: 102, target: 96, entryTime: 0 };

describe('evalBarExit', () => {
  it('target hit = WIN', () => {
    expect(evalBarExit(long, { high: 105, low: 101, close: 104, time: 1 }, noCosts).outcome).toBe('WIN');
  });
  it('stop hit = LOSS', () => {
    expect(evalBarExit(long, { high: 101, low: 97, close: 99, time: 1 }, noCosts).outcome).toBe('LOSS');
  });
  it('both in range = LOSS (pessimistic)', () => {
    const r = evalBarExit(long, { high: 105, low: 97, close: 100, time: 1 }, noCosts);
    expect(r.outcome).toBe('LOSS');
    expect(r.exitPrice).toBe(98);
  });
  it('neither = still open (null)', () => {
    expect(evalBarExit(long, { high: 103, low: 99, close: 101, time: 1 }, noCosts).outcome).toBeNull();
  });
  it('short target hit = WIN', () => {
    expect(evalBarExit(short, { high: 101, low: 95, close: 96, time: 1 }, noCosts).outcome).toBe('WIN');
  });
  it('costs reduce win pnl below gross 4%', () => {
    const r = evalBarExit(long, { high: 105, low: 101, close: 104, time: 1 }, { feePct: 0.1, spreadPct: 0.1, slippagePct: 0.1 });
    expect(r.pnlPct!).toBeLessThan(4);
    expect(r.pnlPct!).toBeCloseTo(3.6, 4); // 4% gross - (2*0.1 + 0.1 + 0.1)% costs
  });
});
