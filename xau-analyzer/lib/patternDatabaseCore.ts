// Phase 22 — Historical Pattern Database, Trade Outcome Learning,
//             ML Probability Model & Adaptive Weight Optimization
//
// Browser-safe learning store; persistence is supplied by its owner.

import type {
  SignalType, PatternType, PatternDirection,
  MarketRegime, RegimeDirection, MarketStructureType,
  VolumeConfirmation, TradingSession, MTFBias,
} from './types';
import { resolveTrade } from './tradeLifecycle';
import type { SimBar } from './backtestEngine';
import { MIN_ADAPT_SAMPLES, MIN_INDICATOR_SAMPLES } from './config';

// ── Shared feature vector stored with every trade ─────────────────────────────
export interface TradeFeatures {
  pattern:            PatternType;
  patternConfidence:  number;
  patternDirection:   PatternDirection;
  regime:             MarketRegime;
  regimeDirection:    RegimeDirection;
  mtfAlignment:       number;       // 0-100
  dominantBias:       MTFBias;
  structureType:      MarketStructureType;
  volumeConfirmation: VolumeConfirmation;
  session:            TradingSession;
  signalType:         SignalType;
  score:              number;
  confidence:         number;
  rr:                 number;
  componentScores: {
    rsi: number; macd: number; bb: number; ema: number;
    stoch: number; volume: number; structure: number; mtf: number;
  };
}

// ── Enriched trade record (features + lifecycle) ──────────────────────────────
export interface EnrichedTradeRecord {
  id:           string;
  timestamp:    number;
  asset:        string;
  features:     TradeFeatures;
  entryPrice:   number;
  stopLoss:     number;
  takeProfit:   number;
  outcome:      'WIN' | 'LOSS' | 'TIMEOUT' | 'PENDING';
  exitPrice?:   number;
  pnlPct?:      number;
  holdMinutes?: number;
}

// ── ML Probability output ─────────────────────────────────────────────────────
export interface MLProbability {
  winRate:        number;   // 0-1  weighted condition-matched win rate
  sampleSize:     number;   // matched historical trades used
  confidence:     number;   // 0-100 reliability of estimate
  patternWinRate: number;   // win rate for identical pattern (NaN if no history)
  regimeWinRate:  number;   // win rate for identical regime (NaN if no history)
  topFactors:     string[]; // which features drove the match
}

// ── Adaptive weights ──────────────────────────────────────────────────────────
export interface AdaptiveWeights {
  rsi:        number;   // multiplier 0.5–1.5 (default 1.0)
  macd:       number;
  bb:         number;
  ema:        number;
  stoch:      number;
  volume:     number;
  structure:  number;
  mtf:        number;
  sampleSize: number;
  updatedAt:  number;
}

const DEFAULT_WEIGHTS: AdaptiveWeights = {
  rsi: 1.0, macd: 1.0, bb: 1.0, ema: 1.0,
  stoch: 1.0, volume: 1.0, structure: 1.0, mtf: 1.0,
  sampleSize: 0, updatedAt: 0,
};

const MAX_RECORDS = 1000;

// ── Similarity: how alike two feature vectors are (0–16) ─────────────────────
function similarity(a: TradeFeatures, b: TradeFeatures): number {
  let s = 0;
  if (a.pattern === b.pattern && a.pattern !== 'NONE') s += 4;
  if (a.regime === b.regime)                           s += 3;
  if (a.regimeDirection === b.regimeDirection)         s += 2;
  if (a.signalType === b.signalType)                   s += 2;
  if (Math.abs(a.mtfAlignment - b.mtfAlignment) <= 20) s += 2;
  if (a.structureType === b.structureType)             s += 1;
  if (a.volumeConfirmation === b.volumeConfirmation)   s += 1;
  if (a.session === b.session)                         s += 1;
  return s;
}

// ── Confidence curve: more samples → higher confidence ───────────────────────
function estimateConfidence(n: number): number {
  return Math.min(95, Math.round((1 - Math.exp(-n / 18)) * 100));
}

// ── Is trade bullish / bearish ────────────────────────────────────────────────
function isBull(sig: SignalType) { return sig === 'BUY' || sig === 'STRONG_BUY'; }
function isBear(sig: SignalType) { return sig === 'SELL' || sig === 'STRONG_SELL'; }

export class PatternDatabaseStore {
  private records: EnrichedTradeRecord[] = [];

  constructor(initial?: EnrichedTradeRecord[], private readonly onChange?: (records: EnrichedTradeRecord[]) => void) {
    if (initial) this.records = structuredClone(initial);
  }

  exportSnapshot(): EnrichedTradeRecord[] {
    return structuredClone(this.records);
  }

  private save(): void {
    this.onChange?.(this.exportSnapshot());
  }

  // ── Record a new pending trade with its feature vector ────────────────────
  record(
    id: string,
    asset: string,
    features: TradeFeatures,
    entryPrice: number,
    stopLoss: number,
    takeProfit: number,
    timestamp: number = Date.now(),
  ): void {
    // Deduplicate: don't record if an identical id already exists...
    if (this.records.some(r => r.id === id)) return;
    // ...or if an unresolved trade for this asset in the same direction is already open
    // (prevents recording the same setup repeatedly → non-independent samples).
    const dir = isBull(features.signalType) ? 'LONG' : isBear(features.signalType) ? 'SHORT' : 'NONE';
    if (dir !== 'NONE' && this.records.some(r =>
      r.asset === asset && r.outcome === 'PENDING' &&
      (isBull(r.features.signalType) ? 'LONG' : isBear(r.features.signalType) ? 'SHORT' : 'NONE') === dir
    )) return;
    this.records.push({
      id, timestamp, asset, features: structuredClone(features),
      entryPrice, stopLoss, takeProfit, outcome: 'PENDING',
    });
    if (this.records.length > MAX_RECORDS) this.records.shift();
    this.save();
  }

  // ── Resolve pending trades against the latest CLOSED candle ───────────────
  // Uses the same shared bar-aware resolver as signalHistory, so both ledgers
  // stay in lock-step and match the backtester's rules (Q-4, BUG-2).
  resolvePending(asset: string, candle: SimBar, currentTime: number, afterEntryOnly = false): void {
    let changed = false;
    for (const r of this.records) {
      if (r.asset !== asset || r.outcome !== 'PENDING') continue;
      if (afterEntryOnly && candle.time < r.timestamp) continue;

      const res = resolveTrade(
        { signal: r.features.signalType, entryPrice: r.entryPrice, stopLoss: r.stopLoss, takeProfit: r.takeProfit, timestamp: r.timestamp },
        candle, currentTime,
      );
      if (!res) continue;

      r.exitPrice   = res.exitPrice;
      r.pnlPct      = res.pnlPct;
      r.holdMinutes = res.holdMinutes;
      r.outcome     = res.outcome;
      changed = true;
    }
    if (changed) this.save();
  }

  // ── ML Probability: condition-matched weighted win rate ───────────────────
  // Scope to one asset when given — BTC and PAXG have ~5-10x different volatility
  // and stop/target geometry, so pooling them produced a meaningless win rate and
  // let one asset satisfy the other's sample-size gate (BUG-7).
  getMLProbability(features: TradeFeatures, asset?: string): MLProbability {
    const completed = this.records.filter(
      r => (r.outcome === 'WIN' || r.outcome === 'LOSS') && (!asset || r.asset === asset)
    );

    if (completed.length === 0) {
      return { winRate: 0.5, sampleSize: 0, confidence: 0, patternWinRate: NaN, regimeWinRate: NaN, topFactors: [] };
    }

    // Weighted matching: include trades with similarity >= 3
    let weightedWins = 0;
    let weightedTotal = 0;
    let matchedCount = 0;
    const factorHits: Record<string, number> = {
      pattern: 0, regime: 0, regimeDir: 0, signal: 0, mtf: 0, structure: 0, volume: 0, session: 0,
    };

    for (const r of completed) {
      const sim = similarity(features, r.features);
      if (sim < 3) continue;
      matchedCount++;
      const w = sim;
      weightedTotal += w;
      if (r.outcome === 'WIN') weightedWins += w;
      // Tally which conditions matched
      if (features.pattern === r.features.pattern && features.pattern !== 'NONE') factorHits.pattern += w;
      if (features.regime === r.features.regime)           factorHits.regime    += w;
      if (features.regimeDirection === r.features.regimeDirection) factorHits.regimeDir += w;
      if (features.signalType === r.features.signalType)   factorHits.signal    += w;
      if (Math.abs(features.mtfAlignment - r.features.mtfAlignment) <= 20) factorHits.mtf += w;
      if (features.structureType === r.features.structureType) factorHits.structure += w;
      if (features.volumeConfirmation === r.features.volumeConfirmation) factorHits.volume += w;
      if (features.session === r.features.session)         factorHits.session   += w;
    }

    const sampleSize = matchedCount; // real count of matched decided trades
    const winRate    = weightedTotal > 0 ? weightedWins / weightedTotal : 0.5;

    // Pattern-specific win rate
    const patternTrades = completed.filter(r => r.features.pattern === features.pattern && features.pattern !== 'NONE');
    const patternWinRate = patternTrades.length > 0
      ? patternTrades.filter(r => r.outcome === 'WIN').length / patternTrades.length
      : NaN;

    // Regime-specific win rate (same regime + direction)
    const regimeTrades = completed.filter(r =>
      r.features.regime === features.regime && r.features.regimeDirection === features.regimeDirection
    );
    const regimeWinRate = regimeTrades.length > 0
      ? regimeTrades.filter(r => r.outcome === 'WIN').length / regimeTrades.length
      : NaN;

    // Top matching factors (by total matched weight, descending)
    const factorLabels: Record<string, string> = {
      pattern: `Pattern: ${features.pattern.replace(/_/g, ' ')}`,
      regime: `Regime: ${features.regime}`,
      regimeDir: `Regime direction: ${features.regimeDirection}`,
      signal: `Signal type: ${features.signalType}`,
      mtf: `MTF alignment ~${features.mtfAlignment}%`,
      structure: `Structure: ${features.structureType}`,
      volume: `Volume: ${features.volumeConfirmation}`,
      session: `Session: ${features.session}`,
    };
    const topFactors = Object.entries(factorHits)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k]) => factorLabels[k]);

    return {
      winRate: +winRate.toFixed(3),
      sampleSize,
      confidence: estimateConfidence(Math.max(sampleSize, patternTrades.length, regimeTrades.length)),
      patternWinRate: isNaN(patternWinRate) ? NaN : +patternWinRate.toFixed(3),
      regimeWinRate:  isNaN(regimeWinRate)  ? NaN : +regimeWinRate.toFixed(3),
      topFactors,
    };
  }

  // ── Adaptive Weights: which indicators predict wins? ──────────────────────
  getAdaptiveWeights(asset?: string): AdaptiveWeights {
    const completed = (asset
      ? this.records.filter(r => r.asset === asset)
      : this.records
    ).filter(r => r.outcome === 'WIN' || r.outcome === 'LOSS');

    if (completed.length < MIN_ADAPT_SAMPLES) return { ...DEFAULT_WEIGHTS, sampleSize: completed.length, updatedAt: Date.now() };

    const wins   = completed.filter(r => r.outcome === 'WIN').length;
    const baseWR = wins / completed.length;

    type IndKey = 'rsi' | 'macd' | 'bb' | 'ema' | 'stoch' | 'volume' | 'structure' | 'mtf';
    const KEYS: IndKey[] = ['rsi', 'macd', 'bb', 'ema', 'stoch', 'volume', 'structure', 'mtf'];

    const computeWeight = (key: IndKey): number => {
      let correct = 0, correctWins = 0;
      for (const r of completed) {
        const cs  = r.features.componentScores;
        const bull = isBull(r.features.signalType);
        const bear = isBear(r.features.signalType);
        // Indicator is "in the right direction" if it agrees with signal direction
        const indBull = cs[key] > 0;
        const aligned = (bull && indBull) || (bear && !indBull);
        if (!aligned) continue;
        correct++;
        if (r.outcome === 'WIN') correctWins++;
      }
      if (correct < MIN_INDICATOR_SAMPLES) return 1.0;
      const indWR = correctWins / correct;
      // Shift from base: positive → above 1.0, negative → below 1.0
      const raw = 1.0 + (indWR - baseWR) * 2.0;
      return Math.max(0.5, Math.min(1.5, +raw.toFixed(3)));
    };

    return {
      rsi:       computeWeight('rsi'),
      macd:      computeWeight('macd'),
      bb:        computeWeight('bb'),
      ema:       computeWeight('ema'),
      stoch:     computeWeight('stoch'),
      volume:    computeWeight('volume'),
      structure: computeWeight('structure'),
      mtf:       computeWeight('mtf'),
      sampleSize: completed.length,
      updatedAt:  Date.now(),
    };
  }

  getHistory(asset?: string): EnrichedTradeRecord[] {
    const rows = asset ? this.records.filter(r => r.asset === asset) : this.records;
    return rows.slice().reverse();
  }
}

