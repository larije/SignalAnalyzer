import { describe, it, expect, beforeEach } from 'vitest';
import { PatternDatabaseStore } from '../patternDatabase';
import type { TradeFeatures } from '../patternDatabase';
import type { SimBar } from '../backtestEngine';

const bar = (high: number, low: number, close: number, time = 1): SimBar => ({ high, low, close, time });

function feat(overrides: Partial<TradeFeatures> = {}): TradeFeatures {
  return {
    pattern: 'BULL_FLAG',
    patternConfidence: 80,
    patternDirection: 'BULLISH',
    regime: 'TRENDING',
    regimeDirection: 'BULLISH',
    mtfAlignment: 80,
    dominantBias: 'BULLISH',
    structureType: 'STRONG_UPTREND',
    volumeConfirmation: 'BULL',
    session: 'LONDON',
    signalType: 'BUY',
    score: 40,
    confidence: 70,
    rr: 2,
    componentScores: { rsi: 10, macd: 10, bb: 5, ema: 7, stoch: 5, volume: 5, structure: 10, mtf: 15 },
    ...overrides,
  };
}

let db: PatternDatabaseStore;
beforeEach(() => { db = new PatternDatabaseStore(); });

describe('getMLProbability', () => {
  it('sampleSize is the real matched count; winRate excludes timeouts', () => {
    const f = feat();
    // 3 wins, 1 loss, 1 timeout — recorded then resolved one at a time (dedup guard)
    db.record('id1', 'BTC', f, 100, 98, 104, 0); db.resolvePending('BTC', bar(104, 100, 104), 1_000);              // WIN
    db.record('id2', 'BTC', f, 100, 98, 104, 0); db.resolvePending('BTC', bar(104, 100, 104), 1_000);              // WIN
    db.record('id3', 'BTC', f, 100, 98, 104, 0); db.resolvePending('BTC', bar(104, 100, 104), 1_000);              // WIN
    db.record('id4', 'BTC', f, 100, 98, 104, 0); db.resolvePending('BTC', bar(100, 98, 98), 1_000);                // LOSS
    db.record('id5', 'BTC', f, 100, 98, 104, 0); db.resolvePending('BTC', bar(100.01, 99.99, 100.01), 61 * 60_000); // TIMEOUT

    const ml = db.getMLProbability(f);
    expect(ml.sampleSize).toBe(4);          // timeout excluded from decided matches
    expect(ml.winRate).toBeCloseTo(0.75, 5); // 3 wins / 4 decided
  });

  it('returns neutral 0.5 with no history', () => {
    const ml = db.getMLProbability(feat());
    expect(ml.winRate).toBe(0.5);
    expect(ml.sampleSize).toBe(0);
  });

  it('filters matched trades by asset — BTC and PAXG were pooled (BUG-7)', () => {
    const f = feat();
    // BTC: 2 wins
    db.record('b1', 'BTC', f, 100, 98, 104, 0); db.resolvePending('BTC', bar(104, 100, 104), 1_000);
    db.record('b2', 'BTC', f, 100, 98, 104, 0); db.resolvePending('BTC', bar(104, 100, 104), 1_000);
    // XAU: 2 losses, identical features
    db.record('x1', 'XAU', f, 100, 98, 104, 0); db.resolvePending('XAU', bar(100, 98, 98), 1_000);
    db.record('x2', 'XAU', f, 100, 98, 104, 0); db.resolvePending('XAU', bar(100, 98, 98), 1_000);

    const btc = db.getMLProbability(f, 'BTC');
    expect(btc.sampleSize).toBe(2);        // only the BTC trades, not all 4
    expect(btc.winRate).toBeCloseTo(1, 5); // 2/2 BTC wins, uncontaminated by XAU losses
  });
});
