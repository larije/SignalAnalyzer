// Phase 7 — Signal Performance Tracking
// Browser-safe in-memory store; persistence is supplied by its owner.
// Signals are auto-resolved after 60 minutes using price trajectory.
import type { SignalHistoryEntry, PerformanceStats, SignalType } from './types';
import { CalibrationStore } from './confidenceCalibration';
import { resolveTrade } from './tradeLifecycle';
import type { SimBar } from './backtestEngine';

const MAX_HISTORY = 500;

export interface SignalHistorySnapshot {
  entries: SignalHistoryEntry[];
  calibration: [number, { wins: number; total: number }][];
}

/** Average winning % divided by average losing % magnitude. 0 when either side is empty. */
export function computeAvgRR(wins: { pnlPct: number }[], losses: { pnlPct: number }[]): number {
  if (wins.length === 0 || losses.length === 0) return 0;
  const avgWin  = wins.reduce((s, w) => s + Math.abs(w.pnlPct), 0) / wins.length;
  const avgLoss = losses.reduce((s, l) => s + Math.abs(l.pnlPct), 0) / losses.length;
  return avgLoss > 0 ? +(avgWin / avgLoss).toFixed(2) : 0;
}

/** Per-trade Sharpe: mean / stddev of trade returns. No annualization. 0 if <2 samples or no variance. */
export function perTradeSharpe(pnls: number[]): number {
  if (pnls.length < 2) return 0;
  const mean = pnls.reduce((a, b) => a + b, 0) / pnls.length;
  const variance = pnls.reduce((s, v) => s + (v - mean) ** 2, 0) / (pnls.length - 1);
  const std = Math.sqrt(variance);
  return std > 0 ? +(mean / std).toFixed(2) : 0;
}

/** BUY/STRONG_BUY are one side; SELL/STRONG_SELL the other. */
function sameDirection(a: SignalType, b: SignalType): boolean {
  const side = (s: SignalType) =>
    s === 'BUY' || s === 'STRONG_BUY' ? 'LONG' :
    s === 'SELL' || s === 'STRONG_SELL' ? 'SHORT' : 'NONE';
  return side(a) !== 'NONE' && side(a) === side(b);
}

export class SignalHistoryStore {
  private entries: SignalHistoryEntry[] = [];
  readonly calibration = new CalibrationStore();

  constructor(initial?: SignalHistorySnapshot, private readonly onChange?: (snapshot: SignalHistorySnapshot) => void) {
    if (initial) {
      const snapshot = structuredClone(initial);
      this.entries = snapshot.entries ?? [];
      this.calibration.loadFrom(snapshot.calibration);
    }
  }

  exportSnapshot(): SignalHistorySnapshot {
    return structuredClone({ entries: this.entries, calibration: this.calibration.toJSON() });
  }

  private save(): void {
    this.onChange?.(this.exportSnapshot());
  }

  record(
    asset: string,
    signal: SignalType,
    score: number,
    confidence: number,
    entryPrice: number,
    stopLoss: number,
    takeProfit: number,
    timestamp: number = Date.now(),
    id?: string,
  ): void {
    // De-duplicate: skip if an unresolved trade for this asset in the same
    // direction already exists. Prevents recording the same open setup many
    // times (which would inflate stats with non-independent samples).
    if (id && this.entries.some(e => e.id === id)) return;
    if (this.entries.some(e => e.asset === asset && e.outcome === 'PENDING' && sameDirection(e.signal, signal))) return;

    const entry: SignalHistoryEntry = {
      id: id ?? `${asset}-${timestamp}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp,
      asset,
      signal,
      score,
      confidence,
      entryPrice,
      stopLoss,
      takeProfit,
      outcome: 'PENDING',
    };
    this.entries.push(entry);
    // Cap history
    if (this.entries.length > MAX_HISTORY) this.entries.shift();
    this.save();
  }

  /**
   * Resolve pending signals for an asset against the latest CLOSED candle.
   * Uses the shared bar-aware resolver so intrabar wicks through the stop/TP are
   * caught, exits are booked at the stop/TP level, and costs are applied — the
   * same rules as the backtester (BUG-2). Called on every closed candle.
   */
  resolvePending(asset: string, candle: SimBar, currentTime: number, afterEntryOnly = false): void {
    let changed = false;
    for (const e of this.entries) {
      if (e.asset !== asset || e.outcome !== 'PENDING') continue;
      if (afterEntryOnly && candle.time < e.timestamp) continue;

      const res = resolveTrade(
        { signal: e.signal, entryPrice: e.entryPrice, stopLoss: e.stopLoss, takeProfit: e.takeProfit, timestamp: e.timestamp },
        candle, currentTime,
      );
      if (!res) continue;

      e.exitPrice   = res.exitPrice;
      e.pnlPct      = res.pnlPct;
      e.pnl         = +(e.entryPrice * res.pnlPct / 100).toFixed(4);
      e.holdMinutes = res.holdMinutes;
      e.outcome     = res.outcome;
      // Feed decided outcomes into calibration (timeouts are undecided → skipped).
      if (e.outcome !== 'TIMEOUT') this.calibration.add(e.confidence, e.outcome === 'WIN');
      changed = true;
    }
    if (changed) this.save();
  }

  getHistory(asset?: string): SignalHistoryEntry[] {
    return asset
      ? this.entries.filter(e => e.asset === asset).slice().reverse()
      : this.entries.slice().reverse();
  }

  getStats(asset?: string): PerformanceStats {
    const history = asset
      ? this.entries.filter(e => e.asset === asset)
      : this.entries;

    const completed = history.filter(e => e.outcome !== 'PENDING');
    const pending   = history.filter(e => e.outcome === 'PENDING');
    const wins      = completed.filter(e => e.outcome === 'WIN');
    const losses    = completed.filter(e => e.outcome === 'LOSS');
    const timeouts  = completed.filter(e => e.outcome === 'TIMEOUT');

    const totalWinPct  = wins.reduce((s, e) => s + (e.pnlPct ?? 0), 0);
    const totalLossPct = Math.abs(losses.reduce((s, e) => s + (e.pnlPct ?? 0), 0));

    // Win rate is over DECIDED trades only (win vs loss); timeouts are reported separately.
    const decided  = wins.length + losses.length;
    const winRate  = decided > 0 ? wins.length / decided : 0;
    const lossRate = decided > 0 ? losses.length / decided : 0;

    const profitFactor = totalLossPct > 0 ? +(totalWinPct / totalLossPct).toFixed(2) : totalWinPct > 0 ? 99 : 0;

    const allPnlPct = completed.map(e => e.pnlPct ?? 0);
    const netPnlPct = +allPnlPct.reduce((a, b) => a + b, 0).toFixed(3);
    const expectancy = completed.length > 0
      ? +(netPnlPct / completed.length).toFixed(3)
      : 0;

    const avgRR = computeAvgRR(
      wins.map(e => ({ pnlPct: e.pnlPct ?? 0 })),
      losses.map(e => ({ pnlPct: e.pnlPct ?? 0 })),
    );

    // Max drawdown: running peak-to-trough
    let peak = 0, trough = 0, maxDD = 0, equity = 0;
    for (const e of completed) {
      equity += e.pnlPct ?? 0;
      if (equity > peak) { peak = equity; trough = equity; }
      if (equity < trough) trough = equity;
      const dd = peak - trough;
      if (dd > maxDD) maxDD = dd;
    }

    // Sharpe (per-trade, risk-free = 0, no annualization)
    const sharpeRatio = perTradeSharpe(allPnlPct);

    const pnls = completed.map(e => e.pnlPct ?? 0);
    const bestTrade  = pnls.length > 0 ? Math.max(...pnls) : 0;
    const worstTrade = pnls.length > 0 ? Math.min(...pnls) : 0;

    return {
      totalSignals:     history.length,
      completedSignals: completed.length,
      pendingSignals:   pending.length,
      timeouts:         timeouts.length,
      winRate:          +winRate.toFixed(4),
      lossRate:         +lossRate.toFixed(4),
      profitFactor,
      avgRR,
      expectancy,
      maxDrawdown:      +maxDD.toFixed(3),
      netPnlPct,
      sharpeRatio,
      bestTrade:        +bestTrade.toFixed(3),
      worstTrade:       +worstTrade.toFixed(3),
    };
  }
}

