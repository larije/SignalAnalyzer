import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SignalHistoryStore } from '../signalHistory';
import { flushNow } from '../storage';

const KEY = 'test_persist_hist';

afterEach(() => {
  try { fs.rmSync(path.join(process.cwd(), '.data', `${KEY}.json`)); } catch { /* ignore */ }
});

describe('signal history persistence', () => {
  it('a fresh store loads what a prior store saved', () => {
    const first = new SignalHistoryStore(KEY);
    first.record('BTC', 'BUY', 30, 70, 100, 98, 104);
    first.resolvePending('BTC', { high: 104, low: 100, close: 104, time: 1 }, 1_000); // WIN, mutates + saves
    flushNow(KEY);

    const second = new SignalHistoryStore(KEY);
    const hist = second.getHistory('BTC');
    expect(hist.length).toBe(1);
    expect(hist[0].outcome).toBe('WIN');
    // calibration also restored (1 decided outcome in the 70-79 bucket)
    expect(second.calibration.totalResolved()).toBe(1);
  });
});
