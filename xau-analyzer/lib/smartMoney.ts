// Smart Money Concepts: FVG, Order Blocks, Mitigation Blocks, Liquidity Sweeps
import type { Candle } from './technicalAnalysis';

export type SMCBias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface FairValueGap {
  type: 'BULLISH' | 'BEARISH';
  high: number;
  low: number;
  midpoint: number;
  isFilled: boolean;
  candleIndex: number;
}

export interface OrderBlock {
  type: 'BULLISH' | 'BEARISH';
  high: number;
  low: number;
  midpoint: number;
  isMitigated: boolean;  // price has returned to test the OB
  strength: number;      // 0-100 based on move size that followed
  candleIndex: number;
}

export interface SmartMoneyAnalysis {
  fvgs: FairValueGap[];
  orderBlocks: OrderBlock[];
  mitigationBlocks: OrderBlock[];   // OBs currently being retested
  activeFVG: FairValueGap | null;   // nearest unfilled FVG relative to price
  activeOrderBlock: OrderBlock | null;
  institutionalBias: SMCBias;
  liquidityAbove: number[];         // equal-high clusters (buy-stops)
  liquidityBelow: number[];         // equal-low clusters (sell-stops)
  score: number;                    // -15 to +15
}

export function analyzeSmartMoney(candles: Candle[]): SmartMoneyAnalysis {
  const empty: SmartMoneyAnalysis = {
    fvgs: [], orderBlocks: [], mitigationBlocks: [],
    activeFVG: null, activeOrderBlock: null,
    institutionalBias: 'NEUTRAL', liquidityAbove: [], liquidityBelow: [],
    score: 0,
  };
  if (candles.length < 20) return empty;

  const n     = candles.length;
  const price = candles[n - 1].close;

  // ── Fair Value Gaps ──────────────────────────────────────────
  // Bullish FVG: gap between candle[i-1].high and candle[i+1].low  (price imbalance above)
  // Bearish FVG: gap between candle[i+1].high and candle[i-1].low  (price imbalance below)
  const fvgs: FairValueGap[] = [];
  const lookback = Math.min(n - 2, 80); // scan last 80 candles

  for (let i = n - lookback; i < n - 1; i++) {
    const prev = candles[i - 1];
    const next = candles[i + 1];
    if (!prev || !next) continue;

    const gapBull = next.low - prev.high;          // > 0 → bullish imbalance
    const gapBear = prev.low - next.high;           // > 0 → bearish imbalance

    if (gapBull > prev.high * 0.001) {              // minimum 0.1% gap
      const isFilled = candles.slice(i + 1).some(c => c.low <= prev.high);
      fvgs.push({
        type: 'BULLISH', high: next.low, low: prev.high,
        midpoint: (prev.high + next.low) / 2,
        isFilled, candleIndex: i,
      });
    }
    if (gapBear > next.high * 0.001) {
      const isFilled = candles.slice(i + 1).some(c => c.high >= prev.low);
      fvgs.push({
        type: 'BEARISH', high: prev.low, low: next.high,
        midpoint: (prev.low + next.high) / 2,
        isFilled, candleIndex: i,
      });
    }
  }

  const unfilled = fvgs.filter(f => !f.isFilled).slice(-6);

  // ── Order Blocks ─────────────────────────────────────────────
  // Bullish OB: last bearish candle (close < open) before a strong upward move
  // Bearish OB: last bullish candle (close > open) before a strong downward move
  const orderBlocks: OrderBlock[] = [];
  const impulseMin = 0.003; // 0.3% per candle counts as impulse

  for (let i = n - lookback; i < n - 3; i++) {
    const c = candles[i];
    if (!c) continue;
    const move = (candles[i + 2].close - c.close) / c.close;

    if (c.close < c.open && move > impulseMin * 2) {  // bearish candle → bullish impulse
      const isMitigated = candles.slice(i + 1).some(c2 => c2.low <= c.low);
      orderBlocks.push({
        type: 'BULLISH', high: c.high, low: c.low,
        midpoint: (c.high + c.low) / 2,
        isMitigated, strength: Math.min(100, Math.round(Math.abs(move) * 10000)),
        candleIndex: i,
      });
    }

    if (c.close > c.open && move < -impulseMin * 2) {  // bullish candle → bearish impulse
      const isMitigated = candles.slice(i + 1).some(c2 => c2.high >= c.high);
      orderBlocks.push({
        type: 'BEARISH', high: c.high, low: c.low,
        midpoint: (c.high + c.low) / 2,
        isMitigated, strength: Math.min(100, Math.round(Math.abs(move) * 10000)),
        candleIndex: i,
      });
    }
  }

  const recentOBs       = orderBlocks.slice(-8);
  const mitigationBlocks = recentOBs.filter(ob => ob.isMitigated);

  // ── Liquidity Clusters ───────────────────────────────────────
  // Equal highs within 0.1% → probable buy-stop pool above price
  // Equal lows within 0.1%  → probable sell-stop pool below price
  const recentH = candles.slice(-40).map(c => c.high);
  const recentL = candles.slice(-40).map(c => c.low);
  const liquidityAbove: number[] = [];
  const liquidityBelow: number[] = [];
  const EQ_TOL = 0.001; // 0.1%

  for (let i = 0; i < recentH.length; i++) {
    for (let j = i + 2; j < recentH.length; j++) {
      if (Math.abs(recentH[i] - recentH[j]) / recentH[i] < EQ_TOL && recentH[i] > price) {
        liquidityAbove.push(recentH[i]);
      }
      if (Math.abs(recentL[i] - recentL[j]) / recentL[i] < EQ_TOL && recentL[i] < price) {
        liquidityBelow.push(recentL[i]);
      }
    }
  }

  const uniqAbove = Array.from(new Set(liquidityAbove.map(p => +p.toFixed(4)))).sort((a, b) => a - b).slice(0, 3);
  const uniqBelow = Array.from(new Set(liquidityBelow.map(p => +p.toFixed(4)))).sort((a, b) => b - a).slice(0, 3);

  // ── Institutional Bias & Score ────────────────────────────────
  const bullishFVGs = unfilled.filter(f => f.type === 'BULLISH' && f.midpoint < price);
  const bearishFVGs = unfilled.filter(f => f.type === 'BEARISH' && f.midpoint > price);
  const bullishOBs  = recentOBs.filter(ob => ob.type === 'BULLISH' && ob.midpoint < price && !ob.isMitigated);
  const bearishOBs  = recentOBs.filter(ob => ob.type === 'BEARISH' && ob.midpoint > price && !ob.isMitigated);

  let score = 0;
  score += bullishFVGs.length * 3;
  score -= bearishFVGs.length * 3;
  score += bullishOBs.reduce((s, ob) => s + Math.round(ob.strength * 0.04), 0);
  score -= bearishOBs.reduce((s, ob) => s + Math.round(ob.strength * 0.04), 0);
  score  = Math.max(-15, Math.min(15, score));

  const institutionalBias: SMCBias = score >= 5 ? 'BULLISH' : score <= -5 ? 'BEARISH' : 'NEUTRAL';

  // Nearest active FVG
  const activeFVG = unfilled.length > 0 ? unfilled[unfilled.length - 1] : null;

  // Nearest unmitigated OB
  const activeOrderBlock =
    recentOBs.filter(ob => !ob.isMitigated).slice(-1)[0] ?? null;

  return {
    fvgs: unfilled, orderBlocks: recentOBs, mitigationBlocks,
    activeFVG, activeOrderBlock,
    institutionalBias, liquidityAbove: uniqAbove, liquidityBelow: uniqBelow,
    score,
  };
}
