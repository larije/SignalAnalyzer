import { afterEach, describe, expect, it, vi } from 'vitest';
import { runBrowserBacktest } from '../browserBacktest';

class WorkerDouble {
  static latest: WorkerDouble;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { WorkerDouble.latest = this; }
}

afterEach(() => vi.unstubAllGlobals());

describe('browser backtest worker lifecycle', () => {
  it('returns a result and releases its worker', async () => {
    vi.stubGlobal('Worker', WorkerDouble);
    const promise = runBrowserBacktest('PAXGUSDT', '30d', new AbortController().signal);
    const worker = WorkerDouble.latest;
    expect(worker.postMessage).toHaveBeenCalledWith({ symbol: 'PAXGUSDT', period: '30d' });
    const result = { totalTrades: 12 };
    worker.onmessage!({ data: { result } } as MessageEvent);
    await expect(promise).resolves.toEqual(result);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('cancels work when the asset, period or page changes', async () => {
    vi.stubGlobal('Worker', WorkerDouble);
    const controller = new AbortController();
    const promise = runBrowserBacktest('BTCUSDT', '90d', controller.signal);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(WorkerDouble.latest.terminate).toHaveBeenCalledOnce();
  });

  it('does not start already-cancelled work', async () => {
    const worker = vi.fn();
    vi.stubGlobal('Worker', worker);
    const controller = new AbortController();
    controller.abort();
    await expect(runBrowserBacktest('BTCUSDT', '30d', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker).not.toHaveBeenCalled();
  });

  it.each(['response', 'worker'])('reports %s failures and releases the worker', async kind => {
    vi.stubGlobal('Worker', WorkerDouble);
    const promise = runBrowserBacktest('BTCUSDT', '180d', new AbortController().signal);
    const worker = WorkerDouble.latest;
    if (kind === 'response') worker.onmessage!({ data: { error: 'Market unavailable' } } as MessageEvent);
    else worker.onerror!();
    await expect(promise).rejects.toThrow();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
