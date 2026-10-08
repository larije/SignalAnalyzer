import { describe, expect, it, vi } from 'vitest';
import { SignalHistoryStore } from '../signalHistoryCore';
import { PatternDatabaseStore, type TradeFeatures } from '../patternDatabaseCore';

const features = (): TradeFeatures => ({
  pattern: 'BULL_FLAG', patternConfidence: 80, patternDirection: 'BULLISH',
  regime: 'TRENDING', regimeDirection: 'BULLISH', mtfAlignment: 80, dominantBias: 'BULLISH',
  structureType: 'STRONG_UPTREND', volumeConfirmation: 'BULL', session: 'LONDON',
  signalType: 'BUY', score: 40, confidence: 70, rr: 2,
  componentScores: { rsi: 10, macd: 10, bb: 5, ema: 7, stoch: 5, volume: 5, structure: 10, mtf: 15 },
});
const winningBar = { time: 60_000, high: 104, low: 100, close: 103 };

describe('browser store persistence seams', () => {
  it('round-trips history, performance and confidence calibration through a detached snapshot', () => {
    const changed = vi.fn();
    const original = new SignalHistoryStore(undefined, changed);
    original.record('BTC', 'BUY', 40, 70, 100, 98, 104, 60_000, 'stable-id');
    original.resolvePending('BTC', winningBar, 120_000, true);
    const snapshot = original.exportSnapshot();
    const restored = new SignalHistoryStore(snapshot);
    expect(restored.getStats('BTC')).toEqual(original.getStats('BTC'));
    expect(restored.calibration.totalResolved()).toBe(1);
    snapshot.entries[0].entryPrice = -1;
    snapshot.calibration[0][1].total = 999;
    changed.mock.calls[1][0].entries[0].outcome = 'LOSS';
    expect(restored.getHistory('BTC')[0].entryPrice).toBe(100);
    expect(restored.calibration.totalResolved()).toBe(1);
    expect(original.getHistory('BTC')[0].outcome).toBe('WIN');
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('round-trips learning records without retaining nested feature references', () => {
    const changed = vi.fn();
    const original = new PatternDatabaseStore(undefined, changed);
    const input = features();
    original.record('stable-id', 'BTC', input, 100, 98, 104, 60_000);
    original.resolvePending('BTC', winningBar, 120_000, true);
    const snapshot = original.exportSnapshot();
    const restored = new PatternDatabaseStore(snapshot);
    expect(restored.getMLProbability(features(), 'BTC')).toEqual(original.getMLProbability(features(), 'BTC'));
    snapshot[0].features.componentScores.rsi = -999;
    changed.mock.calls[0][0][0].features.componentScores.rsi = -888;
    input.componentScores.rsi = -777;
    expect(original.getHistory('BTC')[0].features.componentScores.rsi).toBe(10);
    expect(restored.getHistory('BTC')[0].features.componentScores.rsi).toBe(10);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('browser replay skips pre-entry candles and stable ids prevent re-recording a resolved setup', () => {
    const history = new SignalHistoryStore();
    const patterns = new PatternDatabaseStore();
    const record = () => {
      history.record('BTC', 'BUY', 40, 70, 100, 98, 104, 60_000, 'same-closed-candle');
      patterns.record('same-closed-candle', 'BTC', features(), 100, 98, 104, 60_000);
    };
    record();
    for (const store of [history, patterns]) {
      store.resolvePending('BTC', { ...winningBar, time: 0 }, 60_000, true);
      expect(store.getHistory('BTC')[0].outcome).toBe('PENDING');
      store.resolvePending('BTC', winningBar, 120_000, true);
      expect(store.getHistory('BTC')[0].outcome).toBe('WIN');
    }
    record();
    expect(history.getHistory('BTC')).toHaveLength(1);
    expect(patterns.getHistory('BTC')).toHaveLength(1);
  });
});
