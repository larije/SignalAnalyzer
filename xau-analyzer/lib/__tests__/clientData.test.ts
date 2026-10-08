import { describe, expect, it } from 'vitest';
import { isBacktestResult, isChartData, isPerformanceStats } from '../clientData';

const candle = { time: 1720000000000, open: 2300, high: 2302, low: 2299, close: 2301, volume: 15 };
const stats = {
  totalSignals: 40, completedSignals: 32, pendingSignals: 8, timeouts: 2,
  winRate: 0.6, lossRate: 0.4, profitFactor: 1.5, avgRR: 2, expectancy: 0.04,
  maxDrawdown: 1.2, netPnlPct: 2.4, sharpeRatio: 0.3, bestTrade: 0.8, worstTrade: -0.4,
};
const backtest = {
  asset: 'PAXG', period: '30d', totalTrades: 30, wins: 18, losses: 12,
  winRate: 0.6, profitFactor: 1.5, sharpeRatio: 0.3, maxDrawdown: 1.2,
  netPnlPct: 2.4, avgTradePct: 0.08, avgHoldMinutes: 42,
};

describe('chart response validation', () => {
  it('accepts valid candles, an empty history, and finite zero fields', () => {
    expect(isChartData([candle])).toBe(true);
    expect(isChartData([])).toBe(true);
    expect(isChartData([{ time: 0, open: 0, high: 0, low: 0, close: 0, volume: 0 }])).toBe(true);
  });

  it.each([null, {}, { error: 'Unavailable' }, [null], [{}], [candle, null]])('rejects malformed chart payload %j', value => {
    expect(isChartData(value)).toBe(false);
  });

  it('rejects missing or non-finite candle numbers before chart rendering', () => {
    for (const field of Object.keys(candle)) {
      for (const value of [undefined, null, '1', NaN, Infinity, -Infinity]) {
        expect(isChartData([{ ...candle, [field]: value }])).toBe(false);
      }
    }
  });
});

describe('performance response validation', () => {
  it('accepts valid metrics and a history with no completed signals', () => {
    expect(isPerformanceStats(stats)).toBe(true);
    expect(isPerformanceStats({
      totalSignals: 0, completedSignals: 0, pendingSignals: 0, timeouts: 0,
      winRate: 0, lossRate: 0, profitFactor: 0, avgRR: 0, expectancy: 0,
      maxDrawdown: 0, netPnlPct: 0, sharpeRatio: 0, bestTrade: 0, worstTrade: 0,
    })).toBe(true);
  });

  it.each([null, [], {}, { totalSignals: 0 }])('rejects partial performance stats %j', value => {
    expect(isPerformanceStats(value)).toBe(false);
  });

  it('rejects missing or non-finite metrics instead of allowing broken numeric formatting', () => {
    for (const field of Object.keys(stats)) {
      for (const value of [undefined, null, '0', NaN, Infinity, -Infinity]) {
        expect(isPerformanceStats({ ...stats, [field]: value })).toBe(false);
      }
    }
  });
});

describe('backtest response validation', () => {
  it('accepts valid results, extra server fields, and a zero-trade result', () => {
    expect(isBacktestResult({ ...backtest, trades: [] })).toBe(true);
    expect(isBacktestResult({
      asset: 'BTC', period: '90d', totalTrades: 0, wins: 0, losses: 0,
      winRate: 0, profitFactor: 0, sharpeRatio: 0, maxDrawdown: 0,
      netPnlPct: 0, avgTradePct: 0, avgHoldMinutes: 0,
    })).toBe(true);
  });

  it.each([null, [], {}, { totalTrades: 0, winRate: 0 }])('rejects partial backtest results %j', value => {
    expect(isBacktestResult(value)).toBe(false);
  });

  it('rejects missing or non-finite backtest metrics', () => {
    for (const field of Object.keys(backtest).filter(key => key !== 'asset' && key !== 'period')) {
      for (const value of [undefined, null, '0', NaN, Infinity, -Infinity]) {
        expect(isBacktestResult({ ...backtest, [field]: value })).toBe(false);
      }
    }
  });

  it('rejects non-string result identifiers', () => {
    expect(isBacktestResult({ ...backtest, asset: {} })).toBe(false);
    expect(isBacktestResult({ ...backtest, period: null })).toBe(false);
  });
});
