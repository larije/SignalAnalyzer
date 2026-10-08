// Historical backtesting engine — runs the REAL enhanced signal engine bar by bar,
// with trading costs and a pessimistic same-bar exit rule. This is what the live
// app trades, so the reported stats actually reflect the live signals.
//
// Note on multi-timeframe: live MTF fetches real 5m/15m/1h/4h candles. In the
// backtest we resample the single fetched interval into higher timeframes
// (1x/2x/4x). This is an approximation and is labeled as such in the UI.
import type { Candle } from './technicalAnalysis';
import { calculateIndicators } from './technicalAnalysis';
import { generateEnhancedSignal } from './signalEngine';
import { perTradeSharpe } from './signalHistoryCore';
import { isChartData } from './clientData';
import { evalBarExit, totalCostPct, type OpenTrade, type Costs } from './backtestEngine';
import { RESOLVE_TIMEOUT_MIN } from './tradeLifecycle';
import { analyzeVolume } from './volumeAnalysis';
import { detectMarketStructure } from './marketStructure';
import { detectVolatilityRegime } from './volatilityRegime';
import { mtfFromTimeframes } from './multiTimeframe';
import { calculateVolumeProfile } from './volumeProfile';
import { analyzeSessionAt } from './sessionAnalysis';
import { detectPattern } from './patternRecognition';
import { analyzeSmartMoney } from './smartMoney';
import { assessNewsRiskAt } from './newsRisk';
import { detectMarketRegime } from './marketRegime';
import type { BacktestResult, BacktestTrade, BacktestPeriod, SignalType, CorrelationAnalysis } from './types';

interface FetchResult { candles: Candle[]; error?: string }

/** Default costs (percent). Conservative-ish for PAXG/BTC on a retail venue. */
const DEFAULT_COSTS: Costs = { feePct: 0.05, spreadPct: 0.03, slippagePct: 0.02 };

const MINUTES_PER_BAR: Record<string, number> = { '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240 };

/** Fetch historical candles from Binance for backtesting. */
async function fetchHistoricalCandles(symbol: string, interval: string, days: number): Promise<FetchResult> {
  const mpc = MINUTES_PER_BAR[interval] ?? 60;
  const needed = Math.ceil((days * 24 * 60) / mpc);

  const allCandles: Candle[] = [];
  let endTime: number | undefined = undefined;
  const batchSize = 1000;
  let remaining = Math.min(needed, 5000); // cap at 5000 bars

  while (remaining > 0) {
    const limit = Math.min(batchSize, remaining);
    let url = `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    if (endTime) url += `&endTime=${endTime}`;

    try {
      const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { candles: allCandles, error: `HTTP ${res.status}` };
      const raw = await res.json() as string[][];
      if (raw.length === 0) break;
      const batch: Candle[] = raw.map(k => ({
        time: parseInt(k[0]), open: parseFloat(k[1]), high: parseFloat(k[2]),
        low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]),
      }));
      if (!isChartData(batch)) throw new Error('Invalid historical candle data');
      allCandles.unshift(...batch);
      endTime = batch[0].time - 1;
      remaining -= batch.length;
      if (batch.length < limit) break;
    } catch (e) {
      return { candles: allCandles, error: String(e) };
    }
  }
  return { candles: allCandles };
}

/** Group `factor` consecutive candles into one higher-timeframe candle. */
function resample(candles: Candle[], factor: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i + factor <= candles.length; i += factor) {
    const g = candles.slice(i, i + factor);
    out.push({
      time: g[0].time,
      open: g[0].open,
      high: Math.max(...g.map(c => c.high)),
      low: Math.min(...g.map(c => c.low)),
      close: g[g.length - 1].close,
      volume: g.reduce((s, c) => s + c.volume, 0),
    });
  }
  return out;
}

// Correlation needs both assets; in a single-asset backtest we pass a neutral stub.
const NEUTRAL_CORRELATION: CorrelationAnalysis = {
  btcXauCorrelation: 0, xauDxyNote: '', xauUs10yNote: '', btcNasdaqNote: '', btcEthNote: '',
  crossAssetScore: 0, summary: 'backtest — cross-asset correlation not modeled',
};

/** Compute the enhanced signal for the window ending at the last candle. */
function enhancedForWindow(window: Candle[], interval: string) {
  const ind = calculateIndicators(window);
  if (!ind) return null;
  const price = window[window.length - 1].close;
  const t = window[window.length - 1].time;

  const volume = analyzeVolume(window);
  const structure = detectMarketStructure(window);
  const volatility = detectVolatilityRegime(price, ind, window);
  const mtf = mtfFromTimeframes([
    [window, interval, interval],
    [resample(window, 2), `${interval}x2`, `${interval} x2`],
    [resample(window, 4), `${interval}x4`, `${interval} x4`],
  ]);
  const volumeProfile = calculateVolumeProfile(window, 30);
  const session = analyzeSessionAt(new Date(t), window);
  const pattern = detectPattern(window);
  const smartMoney = analyzeSmartMoney(window);
  const newsRisk = assessNewsRiskAt(new Date(t));
  const regime = detectMarketRegime(structure, volatility, volume, ind, mtf);

  return generateEnhancedSignal(
    price, ind, volume, structure, volatility, mtf, pattern, smartMoney,
    newsRisk, session, volumeProfile, NEUTRAL_CORRELATION, regime,
  );
}

function isDirectional(sig: SignalType): boolean {
  return sig === 'BUY' || sig === 'STRONG_BUY' || sig === 'SELL' || sig === 'STRONG_SELL';
}

/** What the simulator needs from a signal at each bar. */
export interface BarSignal { signal: SignalType; stopLoss: number; takeProfit: number; score: number; }
export type SignalFn = (window: Candle[], interval: string) => BarSignal | null;

/** Default signal source: the real enhanced engine. */
const defaultSignalFn: SignalFn = (window, interval) => {
  const enh = enhancedForWindow(window, interval);
  if (!enh) return null;
  return { signal: enh.signal, stopLoss: enh.stopLoss, takeProfit: enh.takeProfit, score: enh.score };
};

/**
 * Pure simulation over a candle series. Extracted from runBacktest so it can be
 * tested deterministically (inject `signalFn`) without any network access.
 */
export function simulate(
  candles: Candle[],
  interval: string,
  asset: string,
  period: BacktestPeriod,
  costs: Costs = DEFAULT_COSTS,
  signalFn: SignalFn = defaultSignalFn,
): BacktestResult {
  const mpc = MINUTES_PER_BAR[interval] ?? 60;
  // Hold trades for the SAME wall-clock window the live engine uses before it
  // times a trade out (RESOLVE_TIMEOUT_MIN), expressed in this interval's bars.
  // Previously fixed at 24h, which made backtest WIN/LOSS/TIMEOUT proportions
  // incomparable with the live 60-minute timeout (BUG-9).
  const maxHoldBars = Math.max(1, Math.ceil(RESOLVE_TIMEOUT_MIN / mpc));

  const empty: BacktestResult = {
    period, asset, interval, totalTrades: 0, wins: 0, losses: 0, timeouts: 0,
    winRate: 0, profitFactor: 0, sharpeRatio: 0, maxDrawdown: 0,
    netPnlPct: 0, avgTradePct: 0, avgHoldMinutes: 0, avgScore: 0, trades: [],
  };
  if (candles.length < 120) return empty;

  const trades: BacktestTrade[] = [];
  const warmup = 60;
  const LOOKBACK = 250; // window fed to the engine each bar

  let inTrade = false;
  let trade: OpenTrade | null = null;
  let entryIdx = 0, entrySignal: SignalType = 'HOLD', entryScore = 0;

  for (let i = warmup; i < candles.length; i++) {
    if (!inTrade) {
      const window = candles.slice(Math.max(0, i - LOOKBACK + 1), i + 1);
      const sig = signalFn(window, interval);
      if (sig && isDirectional(sig.signal)) {
        const dir = (sig.signal === 'BUY' || sig.signal === 'STRONG_BUY') ? 'LONG' : 'SHORT';
        trade = { dir, entry: candles[i].close, stop: sig.stopLoss, target: sig.takeProfit, entryTime: candles[i].time };
        inTrade = true; entryIdx = i; entrySignal = sig.signal; entryScore = sig.score;
      }
      continue;
    }

    // In a trade: evaluate the current bar (the one right after entry on the first pass).
    const bar = candles[i];
    const res = evalBarExit(trade!, { high: bar.high, low: bar.low, close: bar.close, time: bar.time }, costs);
    const heldBars = i - entryIdx;

    let outcome: BacktestTrade['outcome'] | null = null;
    let exitPrice = bar.close;
    let pnlPct = 0;

    if (res.outcome) {
      outcome = res.outcome as BacktestTrade['outcome'];
      exitPrice = res.exitPrice!;
      pnlPct = res.pnlPct!;
    } else if (heldBars >= maxHoldBars) {
      outcome = 'TIMEOUT';
      exitPrice = bar.close;
      const gross = trade!.dir === 'LONG'
        ? (exitPrice - trade!.entry) / trade!.entry
        : (trade!.entry - exitPrice) / trade!.entry;
      pnlPct = +((gross * 100) - totalCostPct(costs)).toFixed(4);
    }

    if (outcome) {
      trades.push({
        entryTime: trade!.entryTime,
        exitTime: bar.time,
        signal: entrySignal,
        entryPrice: trade!.entry,
        exitPrice,
        stopLoss: trade!.stop,
        takeProfit: trade!.target,
        outcome,
        pnl: +(trade!.entry * pnlPct / 100).toFixed(4),
        pnlPct,
        holdMinutes: heldBars * mpc,
        score: entryScore,
      });
      inTrade = false; trade = null;
    }
  }

  // ── Statistics ─────────────────────────────────────────────────
  const wins = trades.filter(t => t.outcome === 'WIN');
  const losses = trades.filter(t => t.outcome === 'LOSS');
  const timeouts = trades.filter(t => t.outcome === 'TIMEOUT');

  const totalWin = wins.reduce((s, t) => s + t.pnlPct, 0);
  const totalLoss = Math.abs(losses.reduce((s, t) => s + t.pnlPct, 0));

  const decided = wins.length + losses.length;
  const winRate = decided > 0 ? +(wins.length / decided).toFixed(4) : 0;
  const profitFactor = totalLoss > 0 ? +(totalWin / totalLoss).toFixed(2) : totalWin > 0 ? 99 : 0;
  const netPnlPct = +trades.reduce((s, t) => s + t.pnlPct, 0).toFixed(3);
  const avgTradePct = trades.length > 0 ? +(netPnlPct / trades.length).toFixed(4) : 0;
  const avgHoldMinutes = trades.length > 0
    ? Math.round(trades.reduce((s, t) => s + t.holdMinutes, 0) / trades.length) : 0;
  const avgScore = trades.length > 0
    ? Math.round(trades.reduce((s, t) => s + t.score, 0) / trades.length) : 0;

  let equity = 0, peak = 0, maxDD = 0;
  for (const t of trades) {
    equity += t.pnlPct;
    if (equity > peak) peak = equity;
    if (peak - equity > maxDD) maxDD = peak - equity;
  }

  const sharpeRatio = perTradeSharpe(trades.map(t => t.pnlPct));

  return {
    period, asset, interval,
    totalTrades: trades.length,
    wins: wins.length, losses: losses.length, timeouts: timeouts.length,
    winRate, profitFactor, sharpeRatio,
    maxDrawdown: +maxDD.toFixed(3),
    netPnlPct, avgTradePct, avgHoldMinutes, avgScore,
    trades: trades.slice(-100),
  };
}

/** Fetch historical candles and run the enhanced-engine backtest over them. */
export async function runBacktest(
  symbol: string,
  period: BacktestPeriod,
  interval = '1h',
  costs: Costs = DEFAULT_COSTS,
): Promise<BacktestResult> {
  const days: Record<BacktestPeriod, number> = { '30d': 30, '90d': 90, '180d': 180, '365d': 365 };
  const { candles, error } = await fetchHistoricalCandles(symbol, interval, days[period]);
  if (error) throw new Error(`Could not load backtest candles: ${error}`);
  return simulate(candles, interval, symbol.replace('USDT', ''), period, costs);
}
