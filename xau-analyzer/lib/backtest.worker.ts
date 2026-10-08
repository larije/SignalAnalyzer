import { runBacktest } from './backtesting';
import type { BacktestPeriod } from './types';

self.onmessage = async (event: MessageEvent<{ symbol: string; period: BacktestPeriod }>) => {
  try {
    const { symbol, period } = event.data;
    if (!['BTCUSDT', 'PAXGUSDT'].includes(symbol) || !['30d', '90d', '180d'].includes(period)) throw new Error('Invalid backtest request.');
    self.postMessage({ result: await runBacktest(symbol, period, '1h') });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Backtest failed.' });
  }
};
