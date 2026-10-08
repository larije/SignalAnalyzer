import { describe, it, expect } from 'vitest';
import { SignalDriver } from '../signalDriver';
import type { LiveSignalResult } from '../liveSignal';

// Minimal fake result — the driver only caches and re-emits it.
const fake = (asset: 'BTC' | 'XAU', t: number): LiveSignalResult =>
  ({ asset, signalCandleTime: t } as LiveSignalResult);

describe('SignalDriver (PERF-1: compute once, fan out)', () => {
  it('has no cached result before the first compute', () => {
    const d = new SignalDriver(async () => null);
    expect(d.getLatest('BTC')).toBeNull();
  });

  it('caches the latest result and emits it on refresh', async () => {
    const result = fake('BTC', 1);
    const d = new SignalDriver(async () => result);
    const heard: LiveSignalResult[] = [];
    d.on('signal', r => heard.push(r));

    const r = await d.refresh('BTC');

    expect(r).toBe(result);
    expect(d.getLatest('BTC')).toBe(result);
    expect(heard).toEqual([result]);
  });

  it('single-flights concurrent refreshes for the same asset (computes once)', async () => {
    let calls = 0;
    const d = new SignalDriver(async () => { calls++; await new Promise(r => setTimeout(r, 5)); return fake('BTC', calls); });

    await Promise.all([d.refresh('BTC'), d.refresh('BTC'), d.refresh('BTC')]);

    expect(calls).toBe(1);
  });

  it('keeps assets independent', async () => {
    const d = new SignalDriver(async (a) => fake(a, a === 'BTC' ? 10 : 20));
    await d.refresh('BTC');
    await d.refresh('XAU');
    expect(d.getLatest('BTC')?.signalCandleTime).toBe(10);
    expect(d.getLatest('XAU')?.signalCandleTime).toBe(20);
  });

  it('does not cache or emit when compute returns null', async () => {
    const d = new SignalDriver(async () => null);
    const heard: LiveSignalResult[] = [];
    d.on('signal', r => heard.push(r));
    const r = await d.refresh('XAU');
    expect(r).toBeNull();
    expect(d.getLatest('XAU')).toBeNull();
    expect(heard).toEqual([]);
  });
});
