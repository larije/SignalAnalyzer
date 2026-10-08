// Pure, testable trade simulator for the backtester.
// Evaluates one open trade against a single bar. Deliberately PESSIMISTIC:
// if a bar's range touches both the stop and the target, we cannot know which
// came first, so we assume the stop (the worst case). Costs (fees + spread +
// slippage) are subtracted from realized pnl so results reflect real trading.

export interface SimBar {
  high: number;
  low: number;
  close: number;
  time: number;
}

export interface OpenTrade {
  dir: 'LONG' | 'SHORT';
  entry: number;
  stop: number;
  target: number;
  entryTime: number;
}

/** All values are PERCENTAGES, e.g. feePct 0.04 = 0.04% per side. */
export interface Costs {
  feePct: number;      // charged on entry and exit (round-trip = 2x)
  spreadPct: number;   // half-spread crossed on entry + exit ≈ one spread
  slippagePct: number; // adverse fill slippage
}

export type SimOutcome = 'WIN' | 'LOSS' | 'TIMEOUT';

export interface BarExitResult {
  outcome: SimOutcome | null; // null = trade still open after this bar
  exitPrice?: number;
  pnlPct?: number;            // net of costs, in percent
}

/** Total round-trip cost in percent. */
export function totalCostPct(costs: Costs): number {
  return 2 * costs.feePct + costs.spreadPct + costs.slippagePct;
}

/** Evaluate an open trade against the NEXT bar. */
export function evalBarExit(t: OpenTrade, bar: SimBar, costs: Costs): BarExitResult {
  const isLong = t.dir === 'LONG';
  const stopHit = isLong ? bar.low <= t.stop : bar.high >= t.stop;
  const tpHit   = isLong ? bar.high >= t.target : bar.low <= t.target;

  let outcome: SimOutcome | null;
  let exitPrice: number;
  if (stopHit && tpHit) { outcome = 'LOSS'; exitPrice = t.stop; }   // pessimistic: assume stop first
  else if (tpHit)       { outcome = 'WIN';  exitPrice = t.target; }
  else if (stopHit)     { outcome = 'LOSS'; exitPrice = t.stop; }
  else                  return { outcome: null };

  const gross = isLong ? (exitPrice - t.entry) / t.entry : (t.entry - exitPrice) / t.entry;
  const pnlPct = +((gross * 100) - totalCostPct(costs)).toFixed(4);
  return { outcome, exitPrice, pnlPct };
}
