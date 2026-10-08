import type { BacktestPeriod, BacktestResult } from './types';

export function runBrowserBacktest(symbol: string, period: BacktestPeriod, signal: AbortSignal): Promise<BacktestResult> {
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./backtest.worker.ts', import.meta.url));
    const cleanup = () => { signal.removeEventListener('abort', abort); worker.terminate(); };
    const abort = () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')); };
    worker.onmessage = (event: MessageEvent<{ result?: BacktestResult; error?: string }>) => {
      cleanup();
      if (event.data.error || !event.data.result) reject(new Error(event.data.error ?? 'Backtest returned no result.'));
      else resolve(event.data.result);
    };
    worker.onerror = () => { cleanup(); reject(new Error('The backtest could not finish. Please try again.')); };
    signal.addEventListener('abort', abort, { once: true });
    worker.postMessage({ symbol, period });
  });
}
