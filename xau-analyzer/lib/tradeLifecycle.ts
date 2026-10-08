// Shared trade-resolution logic used by BOTH the live stores (signalHistory,
// patternDatabase) so their WIN/LOSS/TIMEOUT ledgers can never diverge (Q-4),
// and so live resolution matches the backtester exactly (BUG-2): high/low aware,
// both-touch = LOSS (pessimistic), exit at the stop/TP level, costs subtracted.
import type { SignalType } from './types';
import { evalBarExit, totalCostPct, type SimBar, type OpenTrade, type Costs } from './backtestEngine';

/** Auto-resolve a pending trade to TIMEOUT after this many minutes with no touch. */
export const RESOLVE_TIMEOUT_MIN = 60;

/**
 * Conservative round-trip costs applied to live outcomes. Kept equal to the
 * backtester's DEFAULT_COSTS (backtesting.ts) so live and backtest stats are
 * comparable — the whole point of resolving live trades the same way.
 */
export const LIVE_COSTS: Costs = { feePct: 0.05, spreadPct: 0.03, slippagePct: 0.02 };

export type TradeSide = 'LONG' | 'SHORT' | 'NONE';

/** BUY/STRONG_BUY are long; SELL/STRONG_SELL are short; everything else is not a trade. */
export function signalSide(sig: SignalType): TradeSide {
  if (sig === 'BUY' || sig === 'STRONG_BUY') return 'LONG';
  if (sig === 'SELL' || sig === 'STRONG_SELL') return 'SHORT';
  return 'NONE';
}

export interface PendingTrade {
  signal: SignalType;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  timestamp: number;
}

export interface TradeResolution {
  outcome: 'WIN' | 'LOSS' | 'TIMEOUT';
  exitPrice: number;
  pnlPct: number;      // net of costs, in percent
  holdMinutes: number;
}

/**
 * Resolve a pending directional trade against the latest CLOSED candle.
 *
 * Returns null if the trade is still open (no stop/TP touch and not yet aged out).
 * A real stop/TP touch (checked against the candle's high/low, not just its close)
 * takes precedence over the timeout, matching the backtester's evalBarExit.
 */
export function resolveTrade(
  trade: PendingTrade,
  candle: SimBar,
  now: number,
  opts: { timeoutMin?: number; costs?: Costs } = {},
): TradeResolution | null {
  const side = signalSide(trade.signal);
  if (side === 'NONE') return null;

  const timeoutMin = opts.timeoutMin ?? RESOLVE_TIMEOUT_MIN;
  const costs = opts.costs ?? LIVE_COSTS;
  const holdMinutes = +((now - trade.timestamp) / 60_000).toFixed(1);

  const open: OpenTrade = {
    dir: side,
    entry: trade.entryPrice,
    stop: trade.stopLoss,
    target: trade.takeProfit,
    entryTime: trade.timestamp,
  };

  const hit = evalBarExit(open, candle, costs);
  if (hit.outcome) {
    return { outcome: hit.outcome, exitPrice: hit.exitPrice!, pnlPct: hit.pnlPct!, holdMinutes };
  }

  if (holdMinutes >= timeoutMin) {
    const gross = side === 'LONG'
      ? (candle.close - trade.entryPrice) / trade.entryPrice
      : (trade.entryPrice - candle.close) / trade.entryPrice;
    const pnlPct = +((gross * 100) - totalCostPct(costs)).toFixed(4);
    return { outcome: 'TIMEOUT', exitPrice: candle.close, pnlPct, holdMinutes };
  }

  return null;
}
