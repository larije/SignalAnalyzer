"use client";
import { useState, useEffect, useRef, useId, useMemo, type ReactNode } from "react";
import { isBacktestResult } from "@/lib/clientData";
import { SignalHistoryStore } from "@/lib/signalHistoryCore";
import { runBrowserBacktest } from "@/lib/browserBacktest";
import { useBrowserAnalysis } from "./useBrowserAnalysis";
import LocalDataPanel from "./LocalDataPanel";
import { loadAssetCandles, selectedChart, type AssetChartState } from "@/lib/assetChart";
import { tint } from "@/lib/theme";
import ThemeToggle from "./ThemeToggle";
import CopyValue from "./CopyValue";
import { priceCopyText } from "@/lib/clipboard";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, ReferenceLine, LineChart, Line,
} from "recharts";
import {
  TrendingUp, TrendingDown, Minus, X, ChevronsUp, ChevronsDown,
  BarChart2, Activity, Brain, Target, Trophy,
  Wifi, Clock, AlertTriangle, Zap, ArrowRight, RefreshCw,
  LayoutDashboard, ChevronLeft, ChevronRight, ChevronDown, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";

// ── Design tokens ─────────────────────────────────────────
const C = {
  bg:     "var(--background)",
  s0:     "var(--surface-subtle)",
  s1:     "var(--surface)",
  s2:     "var(--surface-raised)",
  s3:     "var(--surface-strong)",
  border: "var(--border)",
  cyan:   "var(--signal-cyan)",
  cyanLt: "var(--signal-blue)",
  silver: "var(--text-secondary)",
  text:   "var(--text)",
  dim:    "var(--muted)",
  green:  "var(--signal-green)",
  red:    "var(--signal-red)",
  redText: "var(--signal-red)",
  amber:  "var(--signal-amber)",
  blue:   "var(--signal-blue)",
  blueText: "var(--signal-blue)",
  violet: "var(--signal-violet)",
  orange: "var(--signal-orange)",
  btc:    "var(--signal-cyan)",
};

// ── Typography system ──────────────────────────────────────
const F = {
  sans: '"Inter", "SF Pro Display", system-ui, -apple-system, sans-serif',
  mono: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
  num:  { fontVariantNumeric: "tabular-nums" as const },
};

// ── Types ──────────────────────────────────────────────────
interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; }
interface Ticker  { symbol: string; price: number; open: number; high: number; low: number; volume: number; change: number; changePercent: number; timestamp: number; }
interface BB      { upper: number; middle: number; lower: number; width: number; }
interface MACD    { value: number; signal: number; histogram: number; }
interface Stoch   { k: number; d: number; }
interface Indicators {
  rsi: number; macd: MACD; bb: BB; ema9: number; ema21: number; ema50: number; ema200: number | null;
  atr: number; stoch: Stoch; volume: number; volumeMA: number; relativeVolume: number;
}
type SignalType = "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL" | "NO_TRADE";
interface TradingSignal { signal: SignalType; confidence: number; score: number; entryPrice: number; stopLoss: number; takeProfit: number; reasons: string[]; }

interface TimeframeSignal { timeframe: string; interval: string; signal: SignalType; score: number; emaAlignment: string; trend: string; rsi: number; macdBull: boolean; priceVsEma9: string; }
interface MTFAnalysis { signals: TimeframeSignal[]; bullishCount: number; bearishCount: number; neutralCount: number; alignment: number; confidence: number; dominantBias: string; score: number; }
interface VolumeAnalysis { current: number; average: number; ratio: number; trend: string; spike: boolean; confirmation: string; score: number; }
interface MarketStructure { type: string; recentHH: boolean; recentHL: boolean; recentLH: boolean; recentLL: boolean; bos: boolean; choch: boolean; swingHigh: number; swingLow: number; score: number; strength: number; }
interface VolatilityData { regime: string; atrPct: number; bbWidth: number; rangeExpansion: boolean; stopMultiplier: number; tpMultiplier: number; confidenceAdj: number; }
interface RiskMetrics { stopLoss: number; takeProfit: number; stopLoss2: number; takeProfit2: number; riskReward: number; expectedValue: number; tradeQuality: string; qualityScore: number; }
interface ComponentScores { rsi: number; macd: number; bb: number; ema: number; stoch: number; volume: number; structure: number; mtf: number; }
interface SessionData { currentSession: string; impact: string; sessionRange: number; sessionHigh: number; sessionLow: number; biasNote: string; confidenceAdj: number; isHighVolatility: boolean; }
interface PatternData { pattern: string; confidence: number; direction: string; targetPrice: number; invalidationPrice: number; description: string; }
interface FVGData { type: string; high: number; low: number; midpoint: number; isFilled: boolean; }
interface OBData  { type: string; high: number; low: number; midpoint: number; isMitigated: boolean; strength: number; }
interface SmartMoneyData { institutionalBias: string; score: number; liquidityAbove: number[]; liquidityBelow: number[]; activeFVG: { type: string; high: number; low: number; midpoint: number } | null; activeOrderBlock: { type: string; high: number; low: number; midpoint: number } | null; fvgs: FVGData[]; mitigationBlocks: OBData[]; orderBlocks: OBData[]; }
interface NewsRiskData { riskLevel: string; score: number; upcomingEvents: string[]; tradingRecommendation: string; isAcceptable: boolean; confidenceAdj: number; }
interface VolumeProfileData { poc: number; vah: number; val: number; hvn: number[]; lvn: number[]; totalVolume: number; valueAreaPct: number; }
interface CorrelationData { btcXauCorrelation: number; summary: string; xauDxyNote: string; btcNasdaqNote: string; crossAssetScore: number; }
interface MarketRegimeData { regime: string; direction: string; strength: number; multiplier: number; description: string; compatibilityNote: string; }
interface MLProbabilityData { winRate: number; sampleSize: number; confidence: number; patternWinRate: number; regimeWinRate: number; topFactors: string[]; }
interface AdaptiveWeightsData { rsi: number; macd: number; bb: number; ema: number; stoch: number; volume: number; structure: number; mtf: number; sampleSize: number; updatedAt: number; }
interface EnhancedSignal {
  signal: SignalType; confidence: number; score: number;
  entryPrice: number; stopLoss: number; takeProfit: number; reasons: string[];
  volumeAnalysis: VolumeAnalysis; marketStructure: MarketStructure;
  volatility: VolatilityData; mtfAnalysis: MTFAnalysis;
  riskMetrics: RiskMetrics; componentScores: ComponentScores;
  // Institutional modules
  marketRegime?: MarketRegimeData;
  sessionAnalysis?: SessionData;
  patternResult?: PatternData;
  smartMoney?: SmartMoneyData;
  newsRisk?: NewsRiskData;
  volumeProfile?: VolumeProfileData;
  correlations?: CorrelationData;
  mlProbability?: MLProbabilityData;
  adaptiveWeights?: AdaptiveWeightsData;
  strongSignalGatePassed?: boolean;
  gateFailReasons?: string[];
}
interface PerformanceStats { totalSignals: number; completedSignals: number; pendingSignals: number; timeouts: number; winRate: number; lossRate: number; profitFactor: number; avgRR: number; expectancy: number; maxDrawdown: number; netPnlPct: number; sharpeRatio: number; bestTrade: number; worstTrade: number; }
interface BacktestResult { period: string; asset: string; totalTrades: number; wins: number; losses: number; winRate: number; profitFactor: number; sharpeRatio: number; maxDrawdown: number; netPnlPct: number; avgTradePct: number; avgHoldMinutes: number; }

interface AssetState {
  ticker: Ticker | null; candles: Candle[];
  signal: TradingSignal | null; indicators: Indicators | null;
  enhanced: EnhancedSignal | null;
  signalCandleTime?: number;   // close time of the candle the signal is based on
  stale?: boolean;             // true when data is too old to trade
}
interface LateEntry {
  isLate: boolean;
  lateNote: string | null;
  latePrice: number | null;
}
type Analysis = {
  probabilities: { label: string; target: string; prob: number; bullish: boolean }[];
  trend: "bullish" | "bearish"; strength: string; volatility: string;
  dailySigma: string; mean: number;
  distribution: { price: number; density: number; zone: string }[];
  rsi: number; momentum: number;
};

// ── Helpers ───────────────────────────────────────────────
const fmt = (n: number | null | undefined, d = 2) =>
  n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

function normCDF(x: number) {
  const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;
  const sign = x < 0 ? -1 : 1; const ax = Math.abs(x) / Math.sqrt(2);
  const t = 1/(1+p*ax); const y=1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-ax*ax);
  return 0.5*(1+sign*y);
}

function computeAnalysis(price: number, history: { p: number }[]): Analysis | null {
  if (history.length < 10) return null;
  const prices  = history.map(h => h.p);
  const returns = prices.slice(1).map((p, i) => (p - prices[i]) / prices[i]);
  const mean    = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  const dailySigma = Math.sqrt(variance) * Math.sqrt(390);
  const gains  = returns.filter(r => r > 0);
  const losses = returns.filter(r => r < 0).map(r => -r);
  const rs = (gains.reduce((a,b)=>a+b,0)/14||0.001) / (losses.reduce((a,b)=>a+b,0)/14||0.001);
  const rsi = Math.round(100 - 100 / (1 + rs));
  const momentum = ((prices[prices.length-1] - prices[Math.max(0,prices.length-10)]) / prices[Math.max(0,prices.length-10)]) * 100;
  const probabilities = ["+1%","+2%","+3%","-1%","-2%","-3%"].map(label => {
    const pct = parseFloat(label) / 100; const target = price * (1 + pct);
    const z = (Math.log(target/price) - mean*390) / dailySigma;
    const prob = label.startsWith("+") ? Math.round((1-normCDF(z))*100) : Math.round(normCDF(z)*100);
    return { label, target: fmt(target), prob, bullish: label.startsWith("+") };
  });
  const distribution = Array.from({length:50},(_,i)=>{
    const x=i/49*6-3; const density=parseFloat(((1/Math.sqrt(2*Math.PI))*Math.exp(-0.5*x*x)).toFixed(5));
    return { price: Math.round(price*(1+x*dailySigma)), density, zone: x<-1?"bear":x>1?"bull":"neutral" };
  });
  return { probabilities, trend: mean+momentum/10000>0?"bullish":"bearish",
    strength: Math.abs(mean)>0.0008?"strong":"weak",
    volatility: dailySigma>0.018?"high":dailySigma>0.009?"moderate":"low",
    dailySigma: (dailySigma*100).toFixed(2), mean, distribution, rsi,
    momentum: parseFloat(momentum.toFixed(3)) };
}

// Honest late-entry check: has price already drifted past the frozen entry by
// more than ~0.65 ATR in the signal's direction? The old computeSignalTiming also
// invented minute-precise "active windows" from RSI × constants and a score-based
// "freshness" that repainted intrabar — removed as fabricated precision (UX-2).
function computeLateEntry(sig: TradingSignal, ind: Indicators, currentPrice: number): LateEntry {
  const isBull = sig.signal === "BUY" || sig.signal === "STRONG_BUY";
  const isBear = sig.signal === "SELL" || sig.signal === "STRONG_SELL";
  const atrPct = currentPrice > 0 ? (ind.atr / currentPrice) : 0.002;
  const priceDrift = currentPrice > 0 ? (currentPrice - sig.entryPrice) / currentPrice : 0;
  const isLate = isBull ? priceDrift > atrPct * 0.65 : isBear ? priceDrift < -atrPct * 0.65 : false;
  let lateNote: string | null = null, latePrice: number | null = null;
  if (isLate && isBull) { latePrice = sig.entryPrice + ind.atr * 0.25; lateNote = `Missed entry — wait for pullback ~$${fmt(latePrice)}`; }
  else if (isLate && isBear) { latePrice = sig.entryPrice - ind.atr * 0.25; lateNote = `Missed entry — wait for bounce ~$${fmt(latePrice)}`; }
  return { isLate, lateNote, latePrice };
}

// ── Market data hook ──────────────────────────────────────
function Card({ children, style, accent, className = "" }: { children: React.ReactNode; style?: React.CSSProperties; accent?: string; className?: string }) {
  return (
    <div className={`panel ${className}`} style={{
      minWidth: 0, // allow the card to shrink in grid/flex so ResponsiveContainer charts don't force overflow (A11Y-5)
      background: C.s1,
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      padding: "clamp(16px, 2vw, 24px)",
      boxShadow: "var(--shadow-card)",
      ...(accent ? { borderTop: `2px solid ${accent}` } : {}),
      ...style,
    }}>{children}</div>
  );
}
function Label({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, paddingBottom: 14, borderBottom: `1px solid ${C.border}` }}>
      {accent && <div style={{ width: 3, height: 14, borderRadius: 2, background: accent, flexShrink: 0 }} />}
      <h2 style={{ margin: 0, color: C.silver, fontSize: 16, fontWeight: 600, fontFamily: F.sans }}>{children}</h2>
    </div>
  );
}
function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  // Use the readable text variant for the failing red/blue foregrounds (A11Y-4),
  // keeping the saturated colour for the border tint.
  const textColor = color === C.red ? C.redText : color === C.blue ? C.blueText : color;
  return (
    <span style={{
      fontSize: 12, color: textColor, background: bg,
      border: `1px solid ${tint(color, "28")}`,
      borderRadius: 6, padding: "2px 9px",
      fontFamily: F.sans, fontWeight: 600,
      letterSpacing: "0.02em",
    }}>{label}</span>
  );
}
function MetricBox({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  const c = color ?? C.text;
  return (
    <div style={{ background: C.s2, borderRadius: 12, padding: "16px", border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 11, color: C.dim, fontFamily: F.sans, fontWeight: 500, marginBottom: 8, lineHeight: 1.4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: c, fontFamily: F.sans, ...F.num, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 13, color: C.dim, fontFamily: F.sans, marginTop: 6, lineHeight: 1.5 }}>{sub}</div>}
    </div>
  );
}

const SIG_META: Record<SignalType, { label: string; color: string; bg: string; icon: ReactNode }> = {
  STRONG_BUY:  { label: "STRONG BUY",  color: C.green,  bg: `${tint(C.green, "18")}`,  icon: <ChevronsUp   size={15} strokeWidth={2.5}/> },
  BUY:         { label: "BUY",          color: C.green,  bg: `${tint(C.green, "10")}`,  icon: <TrendingUp   size={15} strokeWidth={2.5}/> },
  HOLD:        { label: "HOLD",         color: C.amber,  bg: `${tint(C.amber, "12")}`,  icon: <Minus        size={15} strokeWidth={2.5}/> },
  SELL:        { label: "SELL",         color: C.red,    bg: `${tint(C.red, "10")}`,    icon: <TrendingDown size={15} strokeWidth={2.5}/> },
  STRONG_SELL: { label: "STRONG SELL",  color: C.red,    bg: `${tint(C.red, "18")}`,    icon: <ChevronsDown size={15} strokeWidth={2.5}/> },
  NO_TRADE:    { label: "NO TRADE",     color: C.silver, bg: `${tint(C.silver, "12")}`, icon: <X            size={15} strokeWidth={2.5}/> },
};

function CopyPriceCell({ label, value, color }: { label: string; value: number; color: string }) {
  return <CopyValue label={label} copyText={priceCopyText(value)} displayValue={`$${fmt(value)}`} color={color} />;
}
function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state" role="status">
    <div className="empty-state-icon"><Activity size={22} aria-hidden="true" /></div>
    <h2>{title}</h2>
    <p>{detail}</p>
  </div>;
}

function OverviewStat({ label, value, detail, icon: Icon, color }: {
  label: string; value: string; detail: string; icon: React.ElementType; color?: string;
}) {
  return <div className="overview-stat">
    <div className="stat-topline"><span className="stat-label">{label}</span><span className="stat-icon"><Icon size={19} strokeWidth={1.8} aria-hidden="true" /></span></div>
    <div className="stat-value" style={color ? { color } : undefined}>{value}</div>
    <div className="stat-detail">{detail}</div>
  </div>;
}

// ── Phase 11 widgets ─────────────────────────────────────

/** Horizontal meter bar */
function MeterBar({ label, value, max = 100, color, showVal = true, height = 4 }: { label: string; value: number; max?: number; color: string; showVal?: boolean; height?: number }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12, fontFamily: F.sans }}>
        <span style={{ color: C.dim, fontWeight: 500, letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</span>
        {showVal && <span style={{ color, fontWeight: 600, ...F.num }}>{value.toFixed(0)}</span>}
      </div>
      <div style={{ height, background: C.s0, borderRadius: height, overflow: "hidden" }}>
        <div style={{
          width: `${pct}%`, height: "100%",
          background: color,
          borderRadius: height,
          transition: "width 0.5s ease",
          boxShadow: `0 0 8px ${tint(color, "50")}`,
        }} />
      </div>
    </div>
  );
}

/** MTF alignment meter */
function MultiTimeframePanel({ mtf }: { mtf: MTFAnalysis }) {
  const sigColor = (s: string) =>
    s === "STRONG_BUY" || s === "BUY" ? C.green :
    s === "STRONG_SELL" || s === "SELL" ? C.red : C.amber;
  const biasColor = mtf.dominantBias === "BULLISH" ? C.green : mtf.dominantBias === "BEARISH" ? C.red : C.amber;

  return (
    <Card accent={biasColor}>
      <Label accent={biasColor}>Multi-Timeframe Confluence</Label>
      <div style={{ display: "flex", gap: 16, marginBottom: 18, alignItems: "center" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
          <MeterBar label="Bullish Alignment" value={mtf.alignment} color={C.green} />
          <MeterBar label="MTF Confidence" value={mtf.confidence} color={C.blue} />
        </div>
        <div style={{ background: C.s2, borderRadius: 12, padding: "14px 18px", textAlign: "center", border: `1px solid ${tint(biasColor, "30")}`, minWidth: 80 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: biasColor, fontFamily: F.sans, ...F.num, lineHeight: 1 }}>{mtf.bullishCount}<span style={{ fontSize: 16, color: C.dim, fontWeight: 400 }}>/{mtf.signals.length}</span></div>
          <div style={{ fontSize: 11, color: C.dim, fontFamily: F.sans, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 5 }}>{mtf.dominantBias}</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {mtf.signals.map(s => {
          const sc = sigColor(s.signal);
          return (
            <div key={s.timeframe} className="mtf-row" style={{ display: "flex", alignItems: "center", gap: 10, background: C.s2, borderRadius: 8, padding: "9px 14px", border: `1px solid ${tint(sc, "18")}` }}>
              <div style={{ width: 52, fontSize: 13, color: C.silver, fontFamily: F.sans, fontWeight: 600, ...F.num }}>{s.timeframe}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: sc, fontFamily: F.sans, fontWeight: 700, width: 90 }}>{SIG_META[s.signal as SignalType]?.icon}{SIG_META[s.signal as SignalType]?.label ?? s.signal}</div>
              <div className="mtf-detail" style={{ flex: 1, display: "flex", gap: 5 }}>
                <Pill label={`RSI ${s.rsi.toFixed(0)}`} color={s.rsi < 35 ? C.green : s.rsi > 65 ? C.red : C.silver} bg={C.s0} />
                <Pill label={s.emaAlignment} color={s.emaAlignment === "BULL" ? C.green : s.emaAlignment === "BEAR" ? C.red : C.amber} bg={C.s0} />
                <Pill label={s.trend} color={s.trend === "UP" ? C.green : s.trend === "DOWN" ? C.red : C.dim} bg={C.s0} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** Volume strength widget */
function VolumePanel({ vol }: { vol: VolumeAnalysis }) {
  const confColor = vol.confirmation.includes("BULL") ? C.green : vol.confirmation.includes("BEAR") ? C.red : C.amber;
  const strengthLabel = vol.ratio >= 2.5 ? "EXTREME" : vol.ratio >= 1.75 ? "VERY HIGH" : vol.ratio >= 1.3 ? "HIGH" : vol.ratio >= 0.9 ? "NORMAL" : vol.ratio >= 0.6 ? "LOW" : "VERY LOW";
  return (
    <div style={{ background: C.s2, borderRadius: 12, padding: "16px", border: `1px solid ${tint(confColor, "22")}` }}>
      <div style={{ fontSize: 12, color: C.dim, fontFamily: F.sans, fontWeight: 500, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 12 }}>Volume</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 700, color: confColor, fontFamily: F.sans, ...F.num, lineHeight: 1 }}>{(vol.ratio * 100).toFixed(0)}%</div>
          <div style={{ fontSize: 13, color: C.dim, fontFamily: F.sans, marginTop: 4, lineHeight: 1.5 }}>of 20-bar avg</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: confColor, fontFamily: F.sans }}>{strengthLabel}</div>
          {vol.spike && <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: C.amber, fontFamily: F.sans, fontWeight: 600, marginTop: 3 }}><Zap size={13} strokeWidth={2.5}/>Spike</div>}
        </div>
      </div>
      <MeterBar label="" value={Math.min(100, vol.ratio * 50)} color={confColor} showVal={false} />
      <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
        <Pill label={vol.trend} color={vol.trend === "RISING" ? C.green : vol.trend === "FALLING" ? C.red : C.dim} bg={C.s0} />
        <Pill label={vol.confirmation.replace("_", " ")} color={confColor} bg={`${tint(confColor, "15")}`} />
      </div>
    </div>
  );
}

/** Market structure panel */
function MarketStructurePanel({ ms }: { ms: MarketStructure }) {
  const typeColor = ms.type.includes("UP") ? C.green : ms.type.includes("DOWN") ? C.red : C.amber;
  const label = ms.type.replace(/_/g, " ");
  return (
    <div style={{ background: C.s2, borderRadius: 12, padding: "16px", border: `1px solid ${tint(typeColor, "22")}` }}>
      <div style={{ fontSize: 12, color: C.dim, fontFamily: F.sans, fontWeight: 500, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 12 }}>Market Structure</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 700, color: typeColor, fontFamily: F.sans, marginBottom: 12 }}>
        {ms.type.includes("STRONG") && ms.type.includes("UP") ? <ChevronsUp size={16} strokeWidth={2.5}/> : ms.type.includes("UP") ? <TrendingUp size={16} strokeWidth={2.5}/> : ms.type.includes("STRONG") && ms.type.includes("DOWN") ? <ChevronsDown size={16} strokeWidth={2.5}/> : ms.type.includes("DOWN") ? <TrendingDown size={16} strokeWidth={2.5}/> : <ArrowRight size={16} strokeWidth={2}/>}
        {label}
      </div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
        {ms.recentHH && <Pill label="HH" color={C.green} bg={`${tint(C.green, "18")}`} />}
        {ms.recentHL && <Pill label="HL" color={C.green} bg={`${tint(C.green, "14")}`} />}
        {ms.recentLH && <Pill label="LH" color={C.red} bg={`${tint(C.red, "18")}`} />}
        {ms.recentLL && <Pill label="LL" color={C.red} bg={`${tint(C.red, "14")}`} />}
        {ms.bos  && <Pill label="BOS" color={C.amber} bg={`${tint(C.amber, "18")}`} />}
        {ms.choch && <Pill label="CHOCH" color={C.violet} bg={`${tint(C.violet, "18")}`} />}
      </div>
      <MeterBar label="Strength" value={ms.strength} color={typeColor} />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontSize: 13, fontFamily: F.sans, ...F.num }}>
        <span style={{ color: C.red, fontWeight: 500 }}>S ${fmt(ms.swingLow)}</span>
        <span style={{ color: C.green, fontWeight: 500 }}>R ${fmt(ms.swingHigh)}</span>
      </div>
    </div>
  );
}

/** Volatility regime badge */
function VolatilityBadge({ vol }: { vol: VolatilityData }) {
  const color = vol.regime === "LOW" ? C.green : vol.regime === "NORMAL" ? C.blue : vol.regime === "HIGH" ? C.amber : C.red;
  return (
    <div style={{ background: C.s2, borderRadius: 12, padding: "16px", border: `1px solid ${tint(color, "22")}` }}>
      <div style={{ fontSize: 12, color: C.dim, fontFamily: F.sans, fontWeight: 500, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 12 }}>Volatility</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 16, fontWeight: 700, color, fontFamily: F.sans }}>
          {vol.regime === "LOW" ? <Target size={16} strokeWidth={2}/> : vol.regime === "NORMAL" ? <Activity size={16} strokeWidth={2}/> : vol.regime === "HIGH" ? <Zap size={16} strokeWidth={2.5}/> : <AlertTriangle size={16} strokeWidth={2.5}/>}
          {vol.regime}
        </div>
        {vol.rangeExpansion && <Pill label="EXPANDING" color={C.amber} bg={`${tint(C.amber, "18")}`} />}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 7 }}>
        {[{ l: "ATR%", v: `${vol.atrPct.toFixed(2)}%` }, { l: "BB W", v: `${vol.bbWidth.toFixed(2)}%` }, { l: "SL ×", v: `${vol.stopMultiplier.toFixed(1)}×` }].map(({ l, v }) => (
          <div key={l} style={{ background: C.s0, borderRadius: 8, padding: "9px 7px", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: C.dim, fontFamily: F.sans, fontWeight: 500, marginBottom: 4 }}>{l}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color, fontFamily: F.sans, ...F.num }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Trade quality badge */
function TradeQualityPanel({ risk }: { risk: RiskMetrics }) {
  const qColor = risk.tradeQuality === "EXCELLENT" ? C.green : risk.tradeQuality === "GOOD" ? C.amber : C.red;
  const starCount = risk.tradeQuality === "EXCELLENT" ? 3 : risk.tradeQuality === "GOOD" ? 2 : 1;
  return (
    <div style={{ background: C.s2, borderRadius: 12, padding: "16px", border: `1px solid ${tint(qColor, "22")}` }}>
      <div style={{ fontSize: 12, color: C.dim, fontFamily: F.sans, fontWeight: 500, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 12 }}>Trade Quality</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: qColor, fontFamily: F.sans }}>{risk.tradeQuality}</div>
        <div style={{ display: "flex", gap: 2 }}>
          {[1,2,3].map(i => <Trophy key={i} size={13} strokeWidth={i <= starCount ? 2.5 : 1.5} fill={i <= starCount ? qColor : "none"} color={i <= starCount ? qColor : C.border}/>)}
        </div>
      </div>
      <MeterBar label="" value={risk.qualityScore} color={qColor} showVal={false} height={5} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 7, marginTop: 12 }}>
        {[{ l: "R:R", v: `1:${risk.riskReward.toFixed(1)}`, c: risk.riskReward >= 2 ? C.green : C.amber },
          { l: "EV",  v: `${risk.expectedValue >= 0 ? "+" : ""}${risk.expectedValue.toFixed(0)}`, c: risk.expectedValue >= 0 ? C.green : C.red },
          { l: "Score", v: `${risk.qualityScore}`, c: qColor }].map(({ l, v, c }) => (
          <div key={l} style={{ background: C.s0, borderRadius: 8, padding: "9px 7px", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: C.dim, fontFamily: F.sans, fontWeight: 500, marginBottom: 4 }}>{l}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: c, fontFamily: F.sans, ...F.num }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Component score breakdown bar chart */
function ComponentScoreBreakdown({ scores, color }: { scores: ComponentScores; color: string }) {
  const entries = [
    { label: "MTF",       value: scores.mtf,       max: 25 },
    { label: "Structure", value: scores.structure,  max: 20 },
    { label: "MACD",      value: scores.macd,       max: 25 },
    { label: "RSI",       value: scores.rsi,        max: 30 },
    { label: "Volume",    value: scores.volume,     max: 15 },
    { label: "BB",        value: scores.bb,         max: 20 },
    { label: "EMA",       value: scores.ema,        max: 15 },
    { label: "Stoch",     value: scores.stoch,      max: 10 },
  ];
  return (
    <div>
      <div style={{ fontSize: 12, color: C.dim, fontFamily: F.sans, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>Component Scores</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {entries.map(e => {
          const pct = ((e.value + e.max) / (e.max * 2)) * 100;
          const c   = e.value > 0 ? C.green : e.value < 0 ? C.red : C.dim;
          return (
            <div key={e.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 58, fontSize: 12, color: C.silver, fontFamily: F.sans, fontWeight: 500, textAlign: "right" }}>{e.label}</div>
              <div style={{ flex: 1, height: 5, background: C.s0, borderRadius: 3, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: C.border }} />
                {e.value !== 0 && (
                  <div style={{
                    position: "absolute",
                    left:  e.value > 0 ? "50%" : `${pct}%`,
                    width: `${Math.abs(e.value) / (e.max * 2) * 100}%`,
                    height: "100%",
                    background: c,
                    borderRadius: 3,
                    boxShadow: `0 0 4px ${tint(c, "60")}`,
                  }} />
                )}
              </div>
              <div style={{ width: 32, fontSize: 12, color: c, fontFamily: F.sans, textAlign: "right", fontWeight: 600, ...F.num }}>
                {e.value > 0 ? "+" : ""}{e.value}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Performance stats panel */
function PerformancePanel({ stats }: { stats: PerformanceStats }) {
  const wColor = stats.winRate >= 0.55 ? C.green : stats.winRate >= 0.45 ? C.amber : C.red;
  const metrics = [
    { l: "Win Rate",   v: `${(stats.winRate * 100).toFixed(1)}%`,  c: wColor },
    { l: "Profit factor", v: stats.profitFactor.toFixed(2),            c: stats.profitFactor >= 1.5 ? C.green : C.amber },
    { l: "Sharpe/trade", v: stats.sharpeRatio.toFixed(2),             c: stats.sharpeRatio >= 1 ? C.green : C.amber },
    { l: "Net P&L",    v: `${stats.netPnlPct >= 0 ? "+" : ""}${stats.netPnlPct.toFixed(2)}%`, c: stats.netPnlPct >= 0 ? C.green : C.red },
    { l: "Expectancy", v: `${stats.expectancy >= 0 ? "+" : ""}${stats.expectancy.toFixed(3)}%`, c: stats.expectancy >= 0 ? C.green : C.red },
    { l: "Max drawdown", v: `${stats.maxDrawdown.toFixed(2)}%`,       c: C.red },
    { l: "Completed",  v: String(stats.completedSignals),           c: C.silver },
    { l: "Pending",    v: String(stats.pendingSignals),             c: C.amber },
  ];
  return (
    <Card accent={C.blue}>
      <Label accent={C.blue}>Signal Performance</Label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginBottom: stats.totalSignals === 0 ? 12 : 0 }}>
        {metrics.map(({ l, v, c }) => (
          <MetricBox key={l} label={l} value={v} color={c} />
        ))}
      </div>
      {stats.totalSignals === 0 && (
        <div style={{ color: C.dim, fontSize: 11, fontFamily: F.sans, textAlign: "center", paddingTop: 8 }}>
          Performance tracking active — signals populate as they are generated
        </div>
      )}
    </Card>
  );
}

/** Backtest results panel */
function BacktestPanel({ result, loading }: { result: BacktestResult | null; loading: boolean }) {
  if (loading) return (
    <div style={{ color: C.dim, fontFamily: F.sans, fontSize: 11, textAlign: "center", padding: "20px 0" }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.blue, margin: "0 auto 8px", animation: "pulse 0.8s infinite" }} />
      Running backtest simulation…
    </div>
  );
  if (!result) return null;
  const wColor = result.winRate >= 0.55 ? C.green : result.winRate >= 0.45 ? C.amber : C.red;
  return (
    <div>
      <div style={{ fontSize: 13, color: C.dim, fontFamily: F.sans, marginBottom: 12 }}>
        {result.asset} · {result.period} · <span style={{ color: C.silver }}>{result.totalTrades} trades</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
        {[
          { l: "Win Rate",  v: `${(result.winRate * 100).toFixed(1)}%`,                        c: wColor },
          { l: "Profit factor", v: result.profitFactor.toFixed(2),                                  c: result.profitFactor >= 1.5 ? C.green : C.amber },
          { l: "Sharpe/trade", v: result.sharpeRatio.toFixed(2),                                   c: result.sharpeRatio >= 1 ? C.green : C.amber },
          { l: "Max drawdown", v: `${result.maxDrawdown.toFixed(2)}%`,                             c: C.red },
          { l: "Net P&L",   v: `${result.netPnlPct >= 0 ? "+" : ""}${result.netPnlPct.toFixed(2)}%`, c: result.netPnlPct >= 0 ? C.green : C.red },
          { l: "Avg Trade", v: `${result.avgTradePct >= 0 ? "+" : ""}${result.avgTradePct.toFixed(3)}%`, c: result.avgTradePct >= 0 ? C.green : C.red },
          { l: "Wins",      v: String(result.wins),                                             c: C.green },
          { l: "Losses",    v: String(result.losses),                                           c: C.red },
        ].map(({ l, v, c }) => <MetricBox key={l} label={l} value={v} color={c} />)}
      </div>
    </div>
  );
}

// ── Original components (preserved) ──────────────────────

function SignalCard({ sig, ind, currentPrice, label, enhanced }: { sig: TradingSignal | null; ind: Indicators | null; currentPrice: number; label: string; enhanced?: EnhancedSignal | null }) {
  if (!sig) return (
    <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, textAlign: "center", color: C.dim, fontSize: 11, fontFamily: F.sans }}>
      Calculating {label} signal…
    </div>
  );
  const eSig = enhanced;
  // Show the ENHANCED verdict (same engine as TradeCallCard) so the two cards can
  // never disagree; the legacy generateSignal result is only a fallback (UX-1/Q-1).
  const m = SIG_META[eSig?.signal ?? sig.signal];
  const late = ind ? computeLateEntry(eSig ?? sig, ind, currentPrice) : null;
  const confColor = eSig ? (eSig.confidence >= 70 ? C.green : eSig.confidence >= 45 ? C.amber : C.red) : m.color;

  return (
    <div style={{ background: `${tint(m.color, "0A")}`, border: `1px solid ${tint(m.color, "25")}`, borderRadius: 12, padding: 14, boxShadow: `0 0 24px ${tint(m.color, "10")}` }}>
      {/* Signal header */}
      <div className="signal-heading">
        <div style={{ display: "flex", alignItems: "center", gap: 7, color: m.color, fontSize: 16, fontWeight: 900, fontFamily: F.sans, letterSpacing: "0.06em" }}>{m.icon}{m.label}</div>
        <div className="signal-metrics">
          {eSig && (
            <div style={{ background: `${tint(confColor, "20")}`, color: confColor, fontSize: 13, fontWeight: 800, padding: "3px 10px", borderRadius: 20, fontFamily: F.sans, border: `1px solid ${tint(confColor, "35")}` }}>
              {eSig.confidence}% CONF
            </div>
          )}
          <div style={{ background: `${tint(m.color, "20")}`, color: m.color, fontSize: 13, fontWeight: 800, padding: "3px 10px", borderRadius: 20, fontFamily: F.sans, border: `1px solid ${tint(m.color, "35")}` }}>
            {Math.round(eSig?.score ?? sig.score)}/100
          </div>
        </div>
      </div>

      {/* Honest late-entry caution (price already drifted past the frozen entry) */}
      {late?.lateNote && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12, padding: "8px 10px", background: `${tint(C.amber, "10")}`, border: `1px solid ${tint(C.amber, "28")}`, borderRadius: 8, fontSize: 12, color: C.amber, fontFamily: F.sans }}>
          <AlertTriangle size={13} strokeWidth={2}/>{late.lateNote}
        </div>
      )}

      {/* Entry / Stop / Target */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 6, marginBottom: 8 }}>
        <CopyPriceCell label="ENTRY"  value={eSig?.entryPrice  ?? sig.entryPrice}  color={C.silver} />
        <CopyPriceCell label="STOP"   value={eSig?.stopLoss    ?? sig.stopLoss}    color={C.red}    />
        <CopyPriceCell label="TARGET" value={eSig?.takeProfit  ?? sig.takeProfit}  color={C.green}  />
      </div>

      {/* TP2 if available */}
      {eSig?.riskMetrics.takeProfit2 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 6, marginBottom: 8 }}>
          <CopyPriceCell label="STOP 2 (Wide)" value={eSig.riskMetrics.stopLoss2}  color={C.red}    />
          <CopyPriceCell label="TARGET 2"      value={eSig.riskMetrics.takeProfit2} color={C.cyanLt} />
        </div>
      )}

      {/* Reasons (from the enhanced engine, matching the verdict shown) */}
      {(() => { const reasons = eSig?.reasons ?? sig.reasons; return reasons.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {reasons.slice(0, 6).map(r => (
            <span key={r} style={{ fontSize: 12, color: m.color, background: `${tint(m.color, "14")}`, border: `1px solid ${tint(m.color, "20")}`, borderRadius: 5, padding: "2px 8px", fontFamily: F.sans }}>{r}</span>
          ))}
        </div>
      ); })()}
    </div>
  );
}

function MiniChart({ candles, color, tf = "1m", height = 190, assetLabel = "" }: { candles: Candle[]; color: string; tf?: Timeframe; height?: number; assetLabel?: string }) {
  const gradientId = `price-gradient-${useId().replace(/:/g, "")}`;
  const data = candles.slice(-80).map(c => {
    const d = new Date(c.time);
    const t = tf === "1d" ? d.toLocaleDateString([], { month: "short", day: "numeric" }) :
      tf === "4h" || tf === "1h" ? d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit" }) :
      d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return { t, p: c.close };
  });
  if (data.length < 2) return <div className="chart-placeholder"><BarChart2 size={24} aria-hidden="true" />No chart data yet<span>The chart appears when market candles are available.</span></div>;
  return (
    <div className="market-chart" role="img" aria-label={`${assetLabel} ${tf} closing prices, ${data.length} candles. Latest price $${fmt(data[data.length - 1].p)}.`}>
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="t" tick={{ fill: C.dim, fontSize: 9, fontFamily: F.sans }} axisLine={false} tickLine={false} minTickGap={55} tickMargin={12} />
        <YAxis domain={["auto","auto"]} hide />
        <Tooltip content={({ active, payload, label }) => active && payload?.length ? <div style={{ background: C.s0, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 12, fontFamily: F.sans, color }}><div style={{ color: C.dim, fontSize: 10, marginBottom: 5 }}>{label}</div>${fmt((payload[0] as {value:number}).value)}</div> : null} />
        <Area type="monotone" dataKey="p" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
    </div>
  );
}

function IndicatorRow({ ind }: { ind: Indicators | null }) {
  if (!ind) return null;
  const rsiColor = ind.rsi > 70 ? C.red : ind.rsi < 30 ? C.green : C.silver;
  const macdUp   = ind.macd.histogram > 0;
  const bbPos    = ind.bb.middle > 0 ? ((ind.bb.middle - ind.bb.lower) / (ind.bb.upper - ind.bb.lower) * 100).toFixed(0) : "50";
  const emaAlign = ind.ema9 > ind.ema21 && ind.ema21 > ind.ema50 ? "↑ Bullish" : ind.ema9 < ind.ema21 && ind.ema21 < ind.ema50 ? "↓ Bearish" : "→ Mixed";
  const emaColor = emaAlign.startsWith("↑") ? C.green : emaAlign.startsWith("↓") ? C.red : C.amber;
  const rvColor  = ind.relativeVolume >= 1.5 ? C.green : ind.relativeVolume <= 0.7 ? C.red : C.silver;
  return (
    <div className="indicator-grid">
      {[
        { l: "RSI",    v: fmt(ind.rsi, 1),                                        c: rsiColor },
        { l: "MACD",   v: `${macdUp ? "▲" : "▼"} ${fmt(Math.abs(ind.macd.histogram), 3)}`, c: macdUp ? C.green : C.red },
        { l: "BB%",    v: `${bbPos}%`,                                            c: C.silver },
        { l: "EMA",    v: emaAlign,                                               c: emaColor },
        { l: "Stoch",  v: `${fmt(ind.stoch.k,1)}/${fmt(ind.stoch.d,1)}`,        c: ind.stoch.k < 20 ? C.green : ind.stoch.k > 80 ? C.red : C.silver },
        { l: "ATR",    v: `$${fmt(ind.atr, 2)}`,                                c: C.silver },
        { l: "RVol",   v: `${(ind.relativeVolume * 100).toFixed(0)}%`,          c: rvColor },
        { l: "EMA200", v: ind.ema200 != null ? `$${fmt(ind.ema200, 0)}` : "n/a",  c: C.dim },
      ].map(({ l, v, c }) => (
        <div key={l} style={{ background: C.s2, borderRadius: 8, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 11, color: C.dim, fontFamily: F.sans, letterSpacing: "0.1em", marginBottom: 3, textTransform: "uppercase" }}>{l}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: c, fontFamily: F.sans }}>{v}</div>
        </div>
      ))}
    </div>
  );
}

function ProbRow({ label, target, prob, bullish }: { label: string; target: string; prob: number; bullish: boolean }) {
  const color = bullish ? C.green : C.red;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ color, fontWeight: 800, fontSize: 11, fontFamily: F.sans, width: 28 }}>{label}</span>
          <span style={{ color: C.dim, fontSize: 13, fontFamily: F.sans }}>${target}</span>
        </div>
        <span style={{ color, fontWeight: 900, fontSize: 12, fontFamily: F.sans, background: `${tint(color, "14")}`, padding: "2px 10px", borderRadius: 6, border: `1px solid ${tint(color, "20")}` }}>{prob}%</span>
      </div>
      <div style={{ height: 3, background: C.s2, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${prob}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.6s ease", boxShadow: `0 0 6px ${tint(color, "50")}` }} />
      </div>
    </div>
  );
}

// ── Institutional Panels ───────────────────────────────────

function MarketRegimePanel({ regime }: { regime: MarketRegimeData }) {
  const regimeColor: Record<string, string> = { TRENDING: C.cyan, RANGING: C.blue, COMPRESSION: C.violet, EXPANSION: C.green, REVERSAL: C.orange };
  const regimeIcon: Record<string, string>  = { TRENDING: '→', RANGING: '↔', COMPRESSION: '◎', EXPANSION: '↗', REVERSAL: '↻' };
  const color    = regimeColor[regime.regime] ?? C.silver;
  const icon     = regimeIcon[regime.regime] ?? '•';
  const dirColor = regime.direction === 'BULLISH' ? C.green : regime.direction === 'BEARISH' ? C.red : C.blue;
  const multPct  = Math.round((regime.multiplier - 1) * 100);
  const multLabel = regime.multiplier > 1.01 ? `▲ +${multPct}%` : regime.multiplier < 0.99 ? `▼ ${multPct}%` : '= 0%';
  const multColor = regime.multiplier > 1.01 ? C.green : regime.multiplier < 0.99 ? C.red : C.silver;
  return (
    <div style={{ background: C.s2, border: `1px solid ${tint(color, "22")}`, borderLeft: `3px solid ${color}`, borderRadius: 12, padding: "14px 16px", boxShadow: `0 0 20px ${tint(color, "08")}` }}>
      <div style={{ fontSize: 11, color: C.dim, fontFamily: F.sans, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 10 }}>Market Regime</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 900, color, fontFamily: F.sans }}>{icon} {regime.regime}</div>
        <div style={{ display: "flex", gap: 6 }}>
          {regime.direction !== 'NEUTRAL' && <Pill label={regime.direction} color={dirColor} bg={`${tint(dirColor, "14")}`} />}
          <Pill label={`SCORE ${multLabel}`} color={multColor} bg={`${tint(multColor, "14")}`} />
        </div>
      </div>
      <div style={{ height: 2, background: C.border, borderRadius: 2, marginBottom: 10, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${regime.strength}%`, background: color, borderRadius: 2, transition: "width 0.5s", boxShadow: `0 0 6px ${tint(color, "60")}` }} />
      </div>
      <div style={{ fontSize: 13, color: C.silver, fontFamily: F.sans, lineHeight: 1.6, marginBottom: 4 }}>{regime.description}</div>
      <div style={{ fontSize: 12, color: C.dim, fontFamily: F.sans, lineHeight: 1.5, fontStyle: "italic" }}>{regime.compatibilityNote}</div>
    </div>
  );
}

function SessionPanel({ session }: { session: SessionData }) {
  const impactColor = session.impact === 'HIGH' ? C.green : session.impact === 'MEDIUM' ? C.amber : C.silver;
  const sessionIcons: Record<string, string> = { ASIAN: '🌏', LONDON: '🇬🇧', NEW_YORK: '🗽', LONDON_NY_OVERLAP: '🔥', OFF_HOURS: '🌙' };
  return (
    <div style={{ background: C.s2, border: `1px solid ${tint(impactColor, "20")}`, borderLeft: `3px solid ${impactColor}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: C.dim, fontFamily: F.sans, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 10 }}>Session</div>
      <div style={{ fontSize: 12, fontWeight: 800, color: impactColor, fontFamily: F.sans, marginBottom: 8 }}>
        {sessionIcons[session.currentSession] ?? ''} {session.currentSession.replace(/_/g, '/')}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <Pill label={`${session.impact} IMPACT`} color={impactColor} bg={`${tint(impactColor, "14")}`} />
        {session.isHighVolatility && <Pill label="HIGH VOL" color={C.red} bg={`${tint(C.red, "14")}`} />}
      </div>
      <div style={{ fontSize: 13, color: C.silver, fontFamily: F.sans, lineHeight: 1.6 }}>{session.biasNote}</div>
      <div style={{ fontSize: 12, color: C.dim, fontFamily: F.sans, marginTop: 8 }}>
        Range {session.sessionRange.toFixed(2)}% · H ${fmt(session.sessionHigh)} / L ${fmt(session.sessionLow)}
      </div>
    </div>
  );
}

function NewsRiskPanel({ nr }: { nr: NewsRiskData }) {
  const color = nr.riskLevel === 'LOW' ? C.green : nr.riskLevel === 'MEDIUM' ? C.amber : nr.riskLevel === 'HIGH' ? C.orange : C.red;
  return (
    <div style={{ background: C.s2, border: `1px solid ${tint(color, "20")}`, borderLeft: `3px solid ${color}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: C.dim, fontFamily: F.sans, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 10 }}>News Risk</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 900, color, fontFamily: F.sans }}>{nr.riskLevel}</div>
        <Pill label={nr.isAcceptable ? 'TRADE OK' : 'AVOID STRONG'} color={nr.isAcceptable ? C.green : C.red} bg={nr.isAcceptable ? `${tint(C.green, "14")}` : `${tint(C.red, "14")}`} />
      </div>
      <div style={{ fontSize: 13, color: C.silver, fontFamily: F.sans, lineHeight: 1.6, marginBottom: 8 }}>{nr.tradingRecommendation}</div>
      {nr.upcomingEvents.slice(0, 2).map((e, i) => (
        <div key={i} style={{ fontSize: 12, color: C.dim, fontFamily: F.sans, padding: "4px 0", borderTop: `1px solid ${C.border}` }}>⚡ {e}</div>
      ))}
    </div>
  );
}

function PatternPanel({ pattern }: { pattern: PatternData }) {
  const dirColor = pattern.direction === 'BULLISH' ? C.green : pattern.direction === 'BEARISH' ? C.red : C.amber;
  const hasPattern = pattern.pattern !== 'NONE';
  return (
    <div style={{ background: C.s2, border: `1px solid ${tint(dirColor, "20")}`, borderLeft: `3px solid ${dirColor}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: C.dim, fontFamily: F.sans, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 10 }}>Pattern Recognition</div>
      {hasPattern ? (
        <>
          <div style={{ fontSize: 12, fontWeight: 900, color: dirColor, fontFamily: F.sans, marginBottom: 8 }}>
            {pattern.pattern.replace(/_/g, ' ')}
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <Pill label={pattern.direction} color={dirColor} bg={`${tint(dirColor, "14")}`} />
            <Pill label={`${pattern.confidence}% conf`} color={pattern.confidence >= 75 ? C.green : C.amber} bg={C.s3} />
          </div>
          <div style={{ fontSize: 13, color: C.silver, fontFamily: F.sans, lineHeight: 1.6, marginBottom: 8 }}>{pattern.description}</div>
          <div style={{ display: "flex", gap: 16, fontSize: 13, fontFamily: F.sans }}>
            <span style={{ color: dirColor }}>Target ${fmt(pattern.targetPrice)}</span>
            <span style={{ color: C.red }}>Invalid ${fmt(pattern.invalidationPrice)}</span>
          </div>
        </>
      ) : (
        <div style={{ color: C.dim, fontSize: 13, fontFamily: F.sans }}>No classic pattern — trade on indicator confluence</div>
      )}
    </div>
  );
}

function SmartMoneyPanel({ sm }: { sm: SmartMoneyData }) {
  const biasColor = sm.institutionalBias === 'BULLISH' ? C.green : sm.institutionalBias === 'BEARISH' ? C.red : C.amber;
  const scColor   = sm.score >= 0 ? C.green : C.red;
  return (
    <div style={{ background: C.s2, border: `1px solid ${tint(biasColor, "20")}`, borderLeft: `3px solid ${biasColor}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: C.dim, fontFamily: F.sans, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 10 }}>Smart Money Concepts</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: biasColor, fontFamily: F.sans }}>{sm.institutionalBias}</div>
        <Pill label={`SMC ${sm.score >= 0 ? '+' : ''}${sm.score}`} color={scColor} bg={`${tint(scColor, "14")}`} />
      </div>
      {sm.activeFVG && <div style={{ fontSize: 12, color: C.silver, fontFamily: F.sans, marginBottom: 4 }}>FVG ({sm.activeFVG.type}) ${fmt(sm.activeFVG.low)}–${fmt(sm.activeFVG.high)}</div>}
      {sm.activeOrderBlock && <div style={{ fontSize: 12, color: C.silver, fontFamily: F.sans, marginBottom: 4 }}>OB ({sm.activeOrderBlock.type}) ${fmt(sm.activeOrderBlock.low)}–${fmt(sm.activeOrderBlock.high)}</div>}
      {sm.liquidityAbove.length > 0 && <div style={{ fontSize: 12, color: C.green, fontFamily: F.sans, marginBottom: 3 }}>▲ Liq {sm.liquidityAbove.map(p => `$${fmt(p)}`).join(', ')}</div>}
      {sm.liquidityBelow.length > 0 && <div style={{ fontSize: 12, color: C.red, fontFamily: F.sans, marginBottom: 3 }}>▼ Liq {sm.liquidityBelow.map(p => `$${fmt(p)}`).join(', ')}</div>}
      <div style={{ fontSize: 12, color: C.dim, fontFamily: F.sans, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
        FVGs {sm.fvgs.length} · OBs {sm.orderBlocks.length} · Mitigated {sm.mitigationBlocks.length}
      </div>
    </div>
  );
}

function VolumeProfilePanel({ vp, price }: { vp: VolumeProfileData; price: number }) {
  const pocColor = Math.abs(price - vp.poc) / price < 0.005 ? C.cyan : C.silver;
  return (
    <div style={{ background: C.s2, borderRadius: 12, padding: "14px 16px", border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 11, color: C.dim, fontFamily: F.sans, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 10 }}>Volume Profile</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
        {[{ l: "POC", v: `$${fmt(vp.poc)}`, c: pocColor }, { l: "VAH", v: `$${fmt(vp.vah)}`, c: C.green }, { l: "VAL", v: `$${fmt(vp.val)}`, c: C.red }].map(({ l, v, c }) => (
          <div key={l} style={{ background: C.s3, borderRadius: 8, padding: "8px 6px", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: C.dim, fontFamily: F.sans, marginBottom: 3 }}>{l}</div>
            <div style={{ fontSize: 11, fontWeight: 800, color: c, fontFamily: F.sans }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: C.dim, fontFamily: F.sans, lineHeight: 1.6 }}>
        <div>HVN ({vp.hvn.length}): {vp.hvn.slice(0, 3).map(p => `$${fmt(p, 0)}`).join(', ')}{vp.hvn.length > 3 ? '…' : ''}</div>
        <div>LVN ({vp.lvn.length}): thin zones — fast moves expected</div>
      </div>
    </div>
  );
}

function CorrelationPanel({ corr, asset }: { corr: CorrelationData; asset: "BTC" | "XAU" }) {
  const corrColor = Math.abs(corr.btcXauCorrelation) > 0.6 ? C.amber : C.silver;
  const corrDir   = corr.btcXauCorrelation > 0 ? 'positive' : 'inverse';
  const assetNote = asset === "BTC" ? corr.btcNasdaqNote : corr.xauDxyNote;
  return (
    <div style={{ background: C.s2, borderRadius: 12, padding: "14px 16px", border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 11, color: C.dim, fontFamily: F.sans, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 10 }}>Correlation Analysis</div>
      <div style={{ fontSize: 11, fontWeight: 800, color: corrColor, fontFamily: F.sans, marginBottom: 10 }}>
        BTC/XAU {corr.btcXauCorrelation > 0 ? '+' : ''}{corr.btcXauCorrelation} <span style={{ color: C.dim, fontWeight: 400 }}>({corrDir})</span>
      </div>
      <div style={{ fontSize: 12, color: C.silver, fontFamily: F.sans, lineHeight: 1.7 }}>
        <div>· {assetNote}</div>
      </div>
      {corr.crossAssetScore !== 0 && (
        <div style={{ fontSize: 12, color: corr.crossAssetScore > 0 ? C.green : C.red, fontFamily: F.sans, marginTop: 8 }}>
          Cross-asset {corr.crossAssetScore > 0 ? '+' : ''}{corr.crossAssetScore}
        </div>
      )}
    </div>
  );
}

function MLProbabilityPanel({ ml }: { ml: MLProbabilityData }) {
  const winPct   = Math.round(ml.winRate * 100);
  const barColor = winPct >= 60 ? C.green : winPct >= 48 ? C.amber : C.red;
  const MIN_SAMPLES = 20; // don't show a win rate until it means something
  const notEnough = ml.sampleSize < MIN_SAMPLES;
  return (
    <div style={{ background: C.s2, border: `1px solid ${tint(barColor, "20")}`, borderLeft: `3px solid ${barColor}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: C.dim, fontFamily: F.sans, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 10 }}>Win rate of similar past signals</div>
      {notEnough ? (
        <div style={{ color: C.dim, fontSize: 13, fontFamily: F.sans, lineHeight: 1.7 }}>Not enough resolved signals like this yet.<br/>Collecting data — {ml.sampleSize} of {MIN_SAMPLES} so far.</div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: barColor, fontFamily: F.sans }}>{winPct}%</div>
            <div style={{ display: "flex", gap: 5 }}>
              <Pill label={`${ml.sampleSize} trades`} color={C.silver} bg={C.s3} />
              <Pill label={`${ml.confidence}% conf`} color={ml.confidence >= 60 ? C.green : C.amber} bg={ml.confidence >= 60 ? `${tint(C.green, "14")}` : `${tint(C.amber, "14")}`} />
            </div>
          </div>
          <div style={{ height: 3, background: C.border, borderRadius: 3, marginBottom: 10, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${winPct}%`, background: barColor, borderRadius: 3, boxShadow: `0 0 6px ${tint(barColor, "50")}` }} />
          </div>
          <div style={{ display: "flex", gap: 14, marginBottom: 8, fontSize: 12, fontFamily: F.sans }}>
            {!isNaN(ml.patternWinRate) && <span style={{ color: C.dim }}>Pattern <span style={{ color: barColor }}>{Math.round(ml.patternWinRate * 100)}%</span></span>}
            {!isNaN(ml.regimeWinRate)  && <span style={{ color: C.dim }}>Regime <span style={{ color: barColor }}>{Math.round(ml.regimeWinRate  * 100)}%</span></span>}
          </div>
          {ml.topFactors.length > 0 && (
            <div style={{ fontSize: 12, color: C.dim, fontFamily: F.sans, lineHeight: 1.6 }}>Matched · {ml.topFactors.join(' · ')}</div>
          )}
        </>
      )}
    </div>
  );
}

function AdaptiveWeightsPanel({ aw }: { aw: AdaptiveWeightsData }) {
  const noData = aw.sampleSize < 15;
  const KEYS: (keyof Omit<AdaptiveWeightsData, 'sampleSize' | 'updatedAt'>)[] = ['rsi', 'macd', 'bb', 'ema', 'stoch', 'volume', 'structure', 'mtf'];
  const weightColor = (w: number) => w > 1.12 ? C.green : w < 0.88 ? C.red : C.silver;
  return (
    <div style={{ background: C.s2, border: `1px solid ${tint(C.violet, "28")}`, borderLeft: `3px solid ${C.violet}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 12, color: C.dim, fontFamily: F.sans, letterSpacing: "0.1em", marginBottom: 6 }}>ADAPTIVE WEIGHTS</div>
      {noData ? (
        <div style={{ color: C.dim, fontSize: 11, fontFamily: F.sans }}>
          Learning from trades… ({aw.sampleSize}/15 resolved)<br/>Weights adjust automatically as outcomes accumulate.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: C.silver, fontFamily: F.sans, marginBottom: 8 }}>
            Optimized from {aw.sampleSize} resolved trades
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px" }}>
            {KEYS.map(k => {
              const w = aw[k] as number;
              const pct = Math.round((w - 1) * 100);
              const color = weightColor(w);
              const barW = Math.round(Math.min(Math.max((w - 0.5) / 1.0 * 100, 0), 100));
              return (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
                  <div style={{ fontSize: 12, color: C.dim, fontFamily: F.sans, width: 52, textTransform: "uppercase" }}>{k}</div>
                  <div style={{ flex: 1, height: 3, background: C.border, borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${barW}%`, background: color, borderRadius: 2 }} />
                  </div>
                  <div style={{ fontSize: 12, fontFamily: F.sans, color, width: 30, textAlign: "right" }}>
                    {pct > 0 ? `+${pct}%` : `${pct}%`}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function GateStatusPanel({ enhanced }: { enhanced: EnhancedSignal }) {
  const passed = enhanced.strongSignalGatePassed;
  const fails  = enhanced.gateFailReasons ?? [];
  if (passed === undefined) return null;
  const color = passed ? C.green : C.amber;
  return (
    <div style={{ background: C.s2, border: `1px solid ${tint(color, "20")}`, borderLeft: `3px solid ${color}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: C.dim, fontFamily: F.sans, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 10 }}>Strong Signal Gate</div>
      <div style={{ fontSize: 11, fontWeight: 900, color, fontFamily: F.sans, marginBottom: 8 }}>
        {passed ? '✓ ALL 6 CRITERIA MET' : `✗ ${fails.length} CRITERIA FAILED`}
      </div>
      {fails.map((f, i) => (
        <div key={i} style={{ fontSize: 12, color: C.amber, fontFamily: F.sans, padding: "3px 0" }}>· {f}</div>
      ))}
      {passed && <div style={{ fontSize: 12, color: C.green, fontFamily: F.sans, lineHeight: 1.7 }}>MTF &gt;80% · Pattern &gt;75% · Structure · Volume · SMC · News OK</div>}
    </div>
  );
}


// ── Timeframe control ────────────────────────────────────
type Timeframe = "1m" | "15m" | "1h" | "4h" | "1d";
const TF_OPTIONS: { label: string; value: Timeframe; limit: number }[] = [
  { label: "1m",  value: "1m",  limit: 80 },
  { label: "15m", value: "15m", limit: 80 },
  { label: "1h",  value: "1h",  limit: 72 },
  { label: "4h",  value: "4h",  limit: 60 },
  { label: "1d",  value: "1d",  limit: 60 },
];

// ── The one clear call (plain English) ────────────────────
function TradeCallCard({ state, asset, color, stats }:
  { state: AssetState; asset: "BTC" | "XAU"; color: string; stats: PerformanceStats | null }) {
  const enh = state.enhanced;
  const assetLabel = asset === "BTC" ? "Bitcoin (BTC)" : "Gold (XAU · PAXG)";

  if (!enh) {
    return (
      <Card accent={color} className="trade-call-card">
        <div className="current-signal-label">CURRENT SIGNAL · {asset === "BTC" ? "BITCOIN" : "GOLD / PAXG"}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}><Clock size={23} color={color} aria-hidden="true" /><div><h2 style={{ fontSize: 15, margin: "0 0 7px", fontWeight: 600 }}>Waiting for a confirmed signal</h2><p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: C.dim }}>The first {assetLabel} signal appears after a candle closes. This panel updates automatically.</p></div></div>
      </Card>
    );
  }

  // Stale data → do not trade.
  if (state.stale) {
    return (
      <Card accent={C.red} className="trade-call-card">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <AlertTriangle size={20} color={C.red} />
          <div>
            <div style={{ fontWeight: 800, color: C.red, fontSize: 16, fontFamily: F.sans }}>STALE — DO NOT TRADE</div>
            <div style={{ color: C.dim, fontSize: 12, fontFamily: F.sans }}>{assetLabel}: market data hasn&rsquo;t updated recently. Wait for the live connection to recover.</div>
          </div>
        </div>
      </Card>
    );
  }

  const bull = enh.signal === "BUY" || enh.signal === "STRONG_BUY";
  const bear = enh.signal === "SELL" || enh.signal === "STRONG_SELL";
  const action = bull ? "BUY" : bear ? "SELL" : "WAIT";
  const actionColor = bull ? C.green : bear ? C.red : C.amber;

  const confLabel = enh.confidence >= 70 ? "Strong" : enh.confidence >= 45 ? "Medium" : "Weak";
  const showNumericConf = !!stats && stats.completedSignals >= 30;
  const late = state.indicators && state.ticker ? computeLateEntry(enh, state.indicators, state.ticker.price) : null;

  const reasons = (enh.reasons ?? []).filter(r => !r.startsWith("⚠")).slice(0, 3);
  const asOf = state.signalCandleTime ? new Date(state.signalCandleTime).toLocaleTimeString() : "—";

  // Honest track record.
  let record = "Not enough resolved signals yet to show a track record.";
  if (stats && stats.completedSignals > 0) {
    const decided = stats.completedSignals - stats.timeouts;
    if (decided > 0) {
      const wins = Math.round(stats.winRate * decided);
      record = `${wins} of ${decided} past ${asset} signals hit target (${Math.round(stats.winRate * 100)}%).`;
    } else {
      record = `${stats.completedSignals} past ${asset} signals resolved, none reached target yet.`;
    }
    if (stats.timeouts > 0) record += ` ${stats.timeouts} timed out.`;
  }

  const priceCell = (label: string, value: number, c: string) => (
    <CopyValue label={label} copyText={priceCopyText(value)} displayValue={`$${fmt(value)}`} color={c} compact contextLabel={assetLabel} />
  );

  return (
    <Card accent={actionColor} className="trade-call-card">
      <div className="current-signal-label">CURRENT SIGNAL · {asset === "BTC" ? "BITCOIN" : "GOLD / PAXG"}</div>
      {/* Headline */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: actionColor, fontFamily: F.sans, letterSpacing: "0.02em" }}>{action}</div>
          <div style={{ fontSize: 13, color: C.silver, fontFamily: F.sans }}>{assetLabel}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: F.sans, fontSize: 12 }}>
          <span style={{ color: C.dim }}>Confidence:</span>
          <span style={{ color: actionColor, fontWeight: 800 }}>{confLabel}{showNumericConf ? ` (${enh.confidence}%)` : ""}</span>
        </div>
      </div>

      {late?.lateNote && <div className="feedback-banner"><AlertTriangle size={15} aria-hidden="true" /><span>{late.lateNote}</span></div>}
      {action === "WAIT" ? (
        <div style={{ fontFamily: F.sans, fontSize: 13, color: C.silver, marginBottom: 12 }}>
          No clean trade right now — the signals don&rsquo;t line up. Wait for a clearer setup.
        </div>
      ) : (
        <div className="trade-levels">
          {priceCell("Entry (locked)", enh.entryPrice, C.text)}
          {priceCell("Stop loss", enh.stopLoss, C.red)}
          {priceCell("Target", enh.takeProfit, C.green)}
          <CopyValue label="Risk:Reward" copyText={priceCopyText(enh.riskMetrics.riskReward) ? `1:${enh.riskMetrics.riskReward.toFixed(2)}` : null}
            displayValue={`1:${enh.riskMetrics.riskReward.toFixed(2)}`} color={C.silver} compact contextLabel={assetLabel} />
        </div>
      )}

      {/* Why */}
      {reasons.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: C.dim, fontFamily: F.sans, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Why</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: C.silver, fontSize: 12.5, fontFamily: F.sans, lineHeight: 1.7 }}>
            {reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      {/* Freshness + track record */}
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, paddingTop: 12, borderTop: `1px solid ${C.border}`, fontFamily: F.sans, fontSize: 11, color: C.dim }}>
        <span style={{ display: "inline-flex", alignItems: "center", flexWrap: "wrap", gap: 5 }}>
          <Clock size={12} /> <span>As of {asOf} · non-repainting</span>
          {state.ticker?.price ? <span style={{ color: C.silver }}>· Live ${fmt(state.ticker.price)}</span> : null}
        </span>
        <span>{record}</span>
      </div>
    </Card>
  );
}

// ── Disclaimer ────────────────────────────────────────────
function Disclaimer() {
  return (
    <aside className="disclaimer" aria-label="About this analysis">
      <strong style={{ color: C.silver }}>Educational tool — not financial advice.</strong> Signals are generated from
      technical indicators on live Binance data and can be wrong. &ldquo;Gold / XAU&rdquo; here is <strong style={{ color: C.silver }}>PAXG</strong>
      {" "}(a tokenized-gold crypto on Binance), which tracks but is not identical to spot gold. Past or simulated
      performance does not guarantee future results. Trade at your own risk.
    </aside>
  );
}

// ── Main page ─────────────────────────────────────────────
export default function Page() {
  const local = useBrowserAnalysis();
  const { btc, xau, connected: wsOk } = local;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeAsset, setActiveAsset] = useState<"BTC" | "XAU">("BTC");
  const [chartTf, setChartTf]   = useState<Timeframe>("1m");
  const [tfSeries, setTfSeries] = useState<AssetChartState | null>(null);
  const [tfRetry, setTfRetry] = useState(0);
  const [backtestState, setBacktestState] = useState<{ key: string; loading: boolean; result: BacktestResult | null; error: string | null } | null>(null);
  const backtestRequestRef = useRef<AbortController | null>(null);
  const [btPeriod, setBtPeriod] = useState<"30d"|"90d"|"180d">("30d");
  const [activeTab, setActiveTab] = useState<"market"|"signals"|"intelligence"|"probability"|"performance">("market");

  const activeState = activeAsset === "BTC" ? btc : xau;
  const activeColor = activeAsset === "BTC" ? C.btc : C.cyan;
  const assetName = activeAsset === "BTC" ? "Bitcoin" : "Gold";
  const assetPair = activeAsset === "BTC" ? "BTC / USDT" : "PAXG / USDT · tokenized gold";
  const assetIcon = activeAsset === "BTC" ? "₿" : "◇";
  const chart = selectedChart(tfSeries, activeAsset, chartTf);
  const chartCandles = chartTf === "1m" ? activeState.candles : chart.candles;
  const savedStats = useMemo(() => new SignalHistoryStore(local.data.history).getStats(activeAsset), [local.data.history, activeAsset]);
  const perfStats = local.historyLoaded ? savedStats : null;
  const perfLoading = !local.historyLoaded;
  const backtestKey = `${activeAsset}:${btPeriod}`;
  const currentBacktest = backtestState?.key === backtestKey ? backtestState : null;
  const backtestResult = currentBacktest?.result ?? null;
  const backtestLoading = currentBacktest?.loading ?? false;
  const backtestError = currentBacktest?.error ?? null;
  const showBacktest = currentBacktest !== null;
  const priceHistory = activeState.candles.slice(-60).map(c => ({ p: c.close }));
  const currentPrice = activeState.ticker?.price ?? 0;
  const analysis = currentPrice > 0 ? computeAnalysis(currentPrice, priceHistory) : null;

  // Non-1m timeframes
  useEffect(() => {
    setTfSeries(null);
    if (chartTf === "1m") return;
    const controller = new AbortController();
    const opt = TF_OPTIONS.find(o => o.value === chartTf)!;
    const request = { asset: activeAsset, timeframe: chartTf };
    setTfSeries({ ...request, candles: [], loading: true, error: null });
    loadAssetCandles(activeAsset, chartTf, opt.limit, controller.signal).then(candles => {
      if (!controller.signal.aborted) setTfSeries({ ...request, candles, loading: false, error: null });
    }).catch(() => {
      if (!controller.signal.aborted) setTfSeries({ ...request, candles: [], loading: false, error: `Could not load the ${activeAsset === "BTC" ? "Bitcoin" : "Gold"} ${opt.label} chart. Retry or choose another interval.` });
    });
    return () => controller.abort();
  }, [activeAsset, chartTf, tfRetry]);

  useEffect(() => {
    backtestRequestRef.current?.abort();
    backtestRequestRef.current = null;
    setBacktestState(null);
    return () => { backtestRequestRef.current?.abort(); };
  }, [activeAsset, btPeriod]);

  const runBacktest = async () => {
    if (backtestRequestRef.current) return;
    const controller = new AbortController();
    backtestRequestRef.current = controller;
    setBacktestState({ key: backtestKey, loading: true, result: null, error: null });
    try {
      const sym = activeAsset === "BTC" ? "BTCUSDT" : "PAXGUSDT";
      const data = await runBrowserBacktest(sym, btPeriod, controller.signal);
      if (!isBacktestResult(data)) throw new Error("Backtest result is unavailable");
      if (!controller.signal.aborted) setBacktestState({ key: backtestKey, loading: false, result: data, error: null });
    } catch {
      if (!controller.signal.aborted) setBacktestState({ key: backtestKey, loading: false, result: null, error: `Could not run the ${btPeriod} backtest for ${activeAsset}. Check the connection and try again.` });
    } finally {
      if (backtestRequestRef.current === controller) backtestRequestRef.current = null;
    }
  };

  const sections = [
    { id: "market", label: "Dashboard", title: `${assetName} dashboard`, description: `Price, current signal, and key indicators for ${assetName === "Gold" ? "gold (PAXG)" : "Bitcoin"}.`, icon: LayoutDashboard },
    { id: "signals", label: "Signals", title: "Signal analysis", description: "See how timeframes, market structure, and volume support the current signal.", icon: Activity },
    { id: "intelligence", label: "Intelligence", title: "Market intelligence", description: "Explore market context, session activity, and the factors behind each setup.", icon: Brain },
    { id: "probability", label: "Probability", title: "Price probabilities", description: "Explore estimated price ranges based on recent volatility. These are rough models.", icon: Target },
    { id: "performance", label: "Performance", title: "Strategy performance", description: "Review resolved signals and simulate the strategy on historical market data.", icon: Trophy },
  ] as const;
  const section = sections.find(item => item.id === activeTab)!;

  const navGroups = [
    { title: "Workspace", ids: ["market"] },
    { title: "Market research", ids: ["signals", "intelligence", "probability"] },
    { title: "Strategy", ids: ["performance"] },
  ];
  const selectedVerdict = activeState.stale ? "STALE" : !activeState.enhanced ? "—" :
    activeState.enhanced.signal.includes("BUY") ? "BUY" : activeState.enhanced.signal.includes("SELL") ? "SELL" : "WAIT";
  const verdictColor = selectedVerdict === "BUY" ? C.green : selectedVerdict === "SELL" ? C.red : selectedVerdict === "—" ? C.dim : C.amber;
  const selectedTicker = activeState.ticker;
  const changeValue = selectedTicker ? `${selectedTicker.changePercent >= 0 ? "+" : ""}${fmt(selectedTicker.changePercent)}%` : "—";

  return (
    <div className="app-shell" data-collapsed={sidebarCollapsed}>
      <a className="skip-link" href="#workspace">Skip to workspace</a>
      <aside className="app-sidebar" aria-label="Application sidebar">
        <div className="sidebar-brand">
          <div className="brand">
            <span className="brand-mark"><BarChart2 size={25} strokeWidth={2} aria-hidden="true" /></span>
            <div className="brand-copy"><div className="brand-subtitle">MARKET INTELLIGENCE</div><div className="brand-name">Signal<span>Analyzer</span></div><div className="brand-caption">Bitcoin & tokenized gold</div></div>
          </div>
          <div className="system-badge"><span className="system-dot" />Analysis workspace</div>
        </div>
        <nav id="sidebar-navigation" className="sidebar-nav" aria-label="Analysis views">
          {navGroups.map(group => <div className="nav-group" key={group.title}>
            <h2 className="nav-section-label">{group.title}</h2>
            {sections.filter(item => group.ids.includes(item.id)).map(({ id, label, icon: Icon }) => (
              <button type="button" key={id} id={`analysis-nav-${id}`} className="sidebar-nav-item" aria-label={label} title={label}
                aria-current={activeTab === id ? "page" : undefined} aria-controls="analysis-view" onClick={() => setActiveTab(id)}>
                <Icon size={19} strokeWidth={activeTab === id ? 2.2 : 1.8} aria-hidden="true" />
                <span className="nav-item-label">{label}</span>{activeTab === id && <span className="nav-active-dot" aria-hidden="true" />}
              </button>
            ))}
          </div>)}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-note"><span className="sidebar-note-icon"><Activity size={17} aria-hidden="true" /></span><div><strong>Live market analysis</strong><span>Closed-candle signals<br />BTC / USDT · PAXG / USDT</span></div></div>
          <button type="button" className="sidebar-nav-item collapse-toggle desktop-only" onClick={() => setSidebarCollapsed(value => !value)} aria-expanded={!sidebarCollapsed} aria-controls="sidebar-navigation" aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {sidebarCollapsed ? <ChevronRight size={19} aria-hidden="true" /> : <ChevronLeft size={19} aria-hidden="true" />}<span className="nav-item-label">Collapse sidebar</span>
          </button>
        </div>
      </aside>
      <div className="app-main">
      <header className="app-topbar">
        <div className="topbar-inner">
          <div className="header-breadcrumb">
            <button type="button" className="icon-button desktop-only" onClick={() => setSidebarCollapsed(value => !value)} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!sidebarCollapsed} aria-controls="sidebar-navigation" title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
              {sidebarCollapsed ? <PanelLeftOpen size={19} aria-hidden="true" /> : <PanelLeftClose size={19} aria-hidden="true" />}
            </button>
            <span className="header-context">Signal Analyzer</span><ChevronRight className="header-divider" size={14} aria-hidden="true" /><strong>{section.label}</strong>
          </div>
          <div className="topbar-meta">
            <ThemeToggle />
            <span className="data-source">Market data <strong>Binance</strong></span>
            <div className={`connection-status ${wsOk ? "is-live" : "is-connecting"}`} role="status"><Wifi size={14} aria-hidden="true" /><span>{wsOk ? "15s updates" : local.error ? "Updates paused" : "Connecting…"}</span></div>
          </div>
        </div>
      </header>
      <main id="workspace" className="app-content" tabIndex={-1}>
        <div className="workspace-heading">
          <div>
            <div className="eyebrow">MARKET INTELLIGENCE</div>
            <h1 id="workspace-title">{section.title}</h1>
            <p className="workspace-description">{section.description}</p>
          </div>
          <div className="asset-picker">
            <span className="control-label" id="asset-label">Analysis asset</span>
            <div className="segmented-control" role="group" aria-labelledby="asset-label">
              {(["BTC", "XAU"] as const).map(asset => (
                <button key={asset} type="button" aria-pressed={activeAsset === asset} aria-controls="analysis-view" onClick={() => setActiveAsset(asset)}>
                  <span className="asset-symbol" aria-hidden="true">{asset === "BTC" ? "₿" : "◇"}</span>{asset === "BTC" ? "Bitcoin" : "Gold"}<span className="asset-code">{asset === "BTC" ? "BTC" : "PAXG"}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="selected-asset-status" role="status">Showing {assetName} data.</p>
        {local.storageError && <div className="feedback-banner" role="alert"><AlertTriangle size={16} aria-hidden="true" /><span>{local.storageError} Existing saved data has not been changed.</span><button type="button" className="app-control" onClick={local.retryStorage}>Retry storage</button><button type="button" className="app-control" onClick={local.continueTemporarily}>Continue temporarily</button></div>}
        {local.storageWarning && <div className="feedback-banner" role="alert"><AlertTriangle size={16} aria-hidden="true" /><span>{local.storageWarning}</span></div>}
        {local.error && <div className="feedback-banner" role="alert"><AlertTriangle size={16} aria-hidden="true" /><span>{local.error}</span><button type="button" className="app-control" onClick={() => void local.refresh()}>Retry</button></div>}
        <LocalDataPanel ready={local.ready} historyLoaded={local.historyLoaded} persistent={local.persistent} count={local.data.history.entries.length} exportBackup={local.exportBackup} restoreBackup={local.restoreBackup} />
        <section key={activeTab} id="analysis-view" aria-labelledby="workspace-title" className="tab-panel">
        {activeTab === "market" && (
          <div key={activeAsset} data-selected-asset={activeAsset}>
            <div className="overview-stats" aria-label={`${assetName} summary`}>
              <OverviewStat label={`${assetName} price`} value={selectedTicker ? `$${fmt(selectedTicker.price)}` : "—"} detail={activeState.stale ? "Last known price · data is stale" : assetPair} icon={BarChart2} />
              <OverviewStat label="24h change" value={changeValue} detail={selectedTicker ? `${selectedTicker.change >= 0 ? "+" : "−"}$${fmt(Math.abs(selectedTicker.change))} over 24 hours` : "Waiting for live market data"} icon={selectedTicker && selectedTicker.changePercent < 0 ? TrendingDown : TrendingUp} color={selectedTicker ? selectedTicker.changePercent >= 0 ? C.green : C.red : C.dim} />
              <OverviewStat label="Current signal" value={selectedVerdict} detail={activeState.stale ? "Market data needs to recover" : !activeState.enhanced ? "Waiting for a confirmed signal" : "Latest closed candle"} icon={Activity} color={verdictColor} />
              <OverviewStat label="Resolved signals" value={perfStats ? perfStats.completedSignals.toLocaleString() : "—"} detail={perfLoading ? `Loading ${assetName} history…` : `${assetName} outcomes in this browser`} icon={Trophy} />
            </div>

            <div className="dashboard-grid">
              <Card accent={activeColor} className="dashboard-chart-card">
                <div className="dashboard-chart-heading">
                  <div className="market-asset-label"><span className="coin-mark" style={{ color: activeColor }} aria-hidden="true">{assetIcon}</span><div><h2 className="section-title">{assetName} price chart</h2><p>{assetPair}</p></div></div>
                  <div className="chart-controls">
                    <span className="control-label" id="timeframe-label">Interval</span>
                    <div className="segmented-control timeframe-picker" role="group" aria-labelledby="timeframe-label">
                      {TF_OPTIONS.map(opt => <button key={opt.value} type="button" aria-pressed={chartTf === opt.value} onClick={() => setChartTf(opt.value)}>{opt.label}</button>)}
                    </div>
                  </div>
                </div>
                {chart.loading ? <div className="chart-placeholder" role="status"><RefreshCw size={22} className="loading-icon" aria-hidden="true" />Loading {assetName} chart<span>{chartTf} candle interval</span></div> : chart.error ?
                  <div className="chart-placeholder"><AlertTriangle size={22} aria-hidden="true" /><span role="alert">{chart.error}</span><button type="button" className="app-control" onClick={() => setTfRetry(value => value + 1)}>Retry chart</button></div> :
                  <MiniChart candles={chartCandles} color={activeColor} tf={chartTf} height={280} assetLabel={assetName} />}
                <div className="dashboard-market-stats" aria-label={`${assetName} 24-hour market statistics`}>
                  <div><span>24h high</span><strong style={{ color: C.green }}>{selectedTicker ? `$${fmt(selectedTicker.high)}` : "—"}</strong></div>
                  <div><span>24h low</span><strong style={{ color: C.red }}>{selectedTicker ? `$${fmt(selectedTicker.low)}` : "—"}</strong></div>
                  <div><span>24h volume · {activeAsset === "BTC" ? "BTC" : "PAXG"}</span><strong>{selectedTicker ? fmt(selectedTicker.volume, 0) : "—"}</strong></div>
                </div>
              </Card>
              <TradeCallCard state={activeState} asset={activeAsset} color={activeColor} stats={perfStats} />
            </div>

            <Card className="dashboard-technical">
              <div className="section-heading">
                <div><h2 className="section-title">Technical snapshot</h2><p className="section-kicker">Key indicators for {assetName === "Gold" ? "gold (PAXG)" : "Bitcoin"}.</p></div>
                <button type="button" className="app-control" onClick={() => { setActiveTab("signals"); document.getElementById("analysis-nav-signals")?.focus(); }}>View signal analysis <ArrowRight size={13} aria-hidden="true" /></button>
              </div>
              {activeState.indicators ? <IndicatorRow ind={activeState.indicators} /> : <p className="section-kicker" role="status">Waiting for {assetName} indicators. They appear as market data arrives.</p>}
              {activeState.signal && !activeState.stale && <details className="signal-details">
                <summary><span><span className="signal-details-title">More signal details</span><span className="signal-details-hint">Extended targets, wider stop, and supporting reasons</span></span><ChevronDown size={17} aria-hidden="true" /></summary>
                <div className="signal-details-body"><SignalCard sig={activeState.signal} ind={activeState.indicators} currentPrice={currentPrice} label={activeAsset} enhanced={activeState.enhanced} /></div>
              </details>}
            </Card>
          </div>
        )}

        {activeTab === "signals" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {activeState.enhanced ? <>
              <div><h2 className="section-title" style={{ marginBottom: 16 }}>{assetName} multi-timeframe analysis</h2><MultiTimeframePanel mtf={activeState.enhanced.mtfAnalysis} /></div>
              <Card accent={activeColor}>
                <Label accent={activeColor}>{assetName} structure and quality</Label>
                <div className="signal-analysis-grid">
                  <MarketStructurePanel ms={activeState.enhanced.marketStructure} />
                  <VolumePanel vol={activeState.enhanced.volumeAnalysis} />
                  <VolatilityBadge vol={activeState.enhanced.volatility} />
                  <TradeQualityPanel risk={activeState.enhanced.riskMetrics} />
                </div>
                <ComponentScoreBreakdown scores={activeState.enhanced.componentScores} color={activeColor} />
              </Card>
            </> : <Card style={{ textAlign: "center" }}><EmptyState title="Building market context" detail={`Analysis for ${assetName} will appear as market data arrives. This view updates automatically.`} /></Card>}
          </div>
        )}
        {activeTab === "intelligence" && (
          activeState.enhanced ? (() => {
            const e = activeState.enhanced;
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div style={{ fontSize: 12, color: C.dim, fontFamily: F.sans, letterSpacing: "0.14em", textTransform: "uppercase", paddingBottom: 10, borderBottom: `1px solid ${C.border}` }}>
                  Institutional Intelligence · {activeAsset === "BTC" ? "Bitcoin" : "Gold"}
                </div>
                {e.marketRegime && <MarketRegimePanel regime={e.marketRegime} />}
                {(e.sessionAnalysis || e.newsRisk) && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 16 }}>
                    {e.sessionAnalysis && <SessionPanel session={e.sessionAnalysis} />}
                    {e.newsRisk && <NewsRiskPanel nr={e.newsRisk} />}
                  </div>
                )}
                {(e.patternResult || e.smartMoney) && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 16 }}>
                    {e.patternResult && <PatternPanel pattern={e.patternResult} />}
                    {e.smartMoney && <SmartMoneyPanel sm={e.smartMoney} />}
                  </div>
                )}
                {(e.volumeProfile || e.correlations || e.strongSignalGatePassed !== undefined) && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))", gap: 16 }}>
                    {e.volumeProfile && <VolumeProfilePanel vp={e.volumeProfile} price={currentPrice} />}
                    {e.correlations && <CorrelationPanel corr={e.correlations} asset={activeAsset} />}
                    <GateStatusPanel enhanced={e} />
                  </div>
                )}
                {(e.mlProbability || e.adaptiveWeights) && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 16 }}>
                    {e.mlProbability   && <MLProbabilityPanel  ml={e.mlProbability} />}
                    {e.adaptiveWeights && <AdaptiveWeightsPanel aw={e.adaptiveWeights} />}
                  </div>
                )}
              </div>
            );
          })() : (
            <Card style={{ textAlign: "center" }}>
              <EmptyState title="Building market context" detail={`Analysis for ${activeAsset === "BTC" ? "Bitcoin" : "Gold / PAXG"} will appear as market data arrives. This view updates automatically.`} />
            </Card>
          )
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* TAB: PROBABILITY — Charts, regime, distribution       */}
        {/* ══════════════════════════════════════════════════════ */}
        {activeTab === "probability" && (
          analysis ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 20 }}>
                <Card>
                  <Label accent={activeColor}>Live Price Feed · {activeAsset}</Label>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={priceHistory.map((h, i) => ({ t: i, p: h.p }))} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="probGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={activeColor} stopOpacity={0.22} />
                          <stop offset="95%" stopColor={activeColor} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
                      <XAxis dataKey="t" hide />
                      <YAxis domain={["auto", "auto"]} tick={{ fill: C.dim, fontSize: 12, fontFamily: F.sans }} tickLine={false} axisLine={false} tickFormatter={v => `$${Math.round(v)}`} width={66} />
                      <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: C.s0, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 14px", fontFamily: F.sans, fontSize: 13, color: activeColor }}>${fmt((payload[0] as { value: number }).value)}</div> : null} />
                      <Area type="monotone" dataKey="p" stroke={activeColor} strokeWidth={2} fill="url(#probGrad)" dot={false} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </Card>
                <Card>
                  <Label accent={activeColor}>Regime Summary</Label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <MetricBox label="Trend" value={`${analysis.trend === "bullish" ? "▲" : "▼"} ${analysis.trend.toUpperCase()}`} color={analysis.trend === "bullish" ? C.green : C.red} sub={`${analysis.strength} signal`} />
                    <MetricBox label="Volatility" value={analysis.volatility.toUpperCase()} color={analysis.volatility === "high" ? C.red : analysis.volatility === "moderate" ? C.amber : C.green} />
                    <MetricBox label="Momentum" value={`${analysis.momentum >= 0 ? "+" : ""}${analysis.momentum}%`} color={analysis.momentum >= 0 ? C.green : C.red} />
                    <MetricBox label="1σ Daily Range" value={`±${analysis.dailySigma}%`} color={C.silver} sub={`$${fmt(currentPrice * (1 - parseFloat(analysis.dailySigma) / 100), 0)} — $${fmt(currentPrice * (1 + parseFloat(analysis.dailySigma) / 100), 0)}`} />
                  </div>
                </Card>
              </div>
              <div style={{ fontSize: 11, color: C.dim, fontFamily: F.sans, lineHeight: 1.6 }}>
                Rough statistical estimate from recent volatility (log-normal), not a prediction. Treat as a &ldquo;likely range&rdquo;, not odds of winning.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 20 }}>
                <Card><Label accent={C.green}>Chance price is above (rough est.)</Label>{analysis.probabilities.filter(p => p.bullish).map(p => <ProbRow key={p.label} {...p} />)}</Card>
                <Card><Label accent={C.red}>Chance price is below (rough est.)</Label>{analysis.probabilities.filter(p => !p.bullish).map(p => <ProbRow key={p.label} {...p} />)}</Card>
              </div>
              <Card>
                <Label accent={C.cyan}>Likely 24h price range · rough model</Label>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={analysis.distribution} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="0%">
                    <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
                    <XAxis dataKey="price" tick={{ fill: C.dim, fontSize: 12, fontFamily: F.sans }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} interval={7} />
                    <YAxis hide />
                    <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: C.s0, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 14px", fontFamily: F.sans, fontSize: 13 }}><div style={{ color: C.cyanLt }}>${(payload[0] as { payload: { price: number } }).payload.price}</div><div style={{ color: C.silver }}>p = {payload[0]?.value}</div></div> : null} />
                    <ReferenceLine x={Math.round(currentPrice)} stroke={activeColor} strokeWidth={2} />
                    <Bar dataKey="density" radius={[2, 2, 0, 0]}>
                      {analysis.distribution.map((e, i) => <Cell key={i} fill={e.zone === "bear" ? `${tint(C.red, "65")}` : e.zone === "bull" ? `${tint(C.green, "65")}` : `${tint(C.cyan, "75")}`} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                {activeState.enhanced && (
                  <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
                    {[
                      { l: "Stop Loss",     v: `$${fmt(activeState.enhanced.riskMetrics.stopLoss)}`,                                                  c: C.red },
                      { l: "Take Profit 1", v: `$${fmt(activeState.enhanced.riskMetrics.takeProfit)}`,                                                c: C.green },
                      { l: "Take Profit 2", v: `$${fmt(activeState.enhanced.riskMetrics.takeProfit2)}`,                                               c: C.cyanLt },
                      { l: "Risk:Reward",   v: `1:${activeState.enhanced.riskMetrics.riskReward.toFixed(2)}`,                                         c: activeState.enhanced.riskMetrics.riskReward >= 2 ? C.green : C.amber },
                      { l: "Quality",       v: activeState.enhanced.riskMetrics.tradeQuality,                                                         c: activeState.enhanced.riskMetrics.tradeQuality === "EXCELLENT" ? C.green : activeState.enhanced.riskMetrics.tradeQuality === "GOOD" ? C.amber : C.red },
                    ].map(({ l, v, c }) => (
                      <div key={l} style={{ background: C.s2, borderRadius: 10, padding: "12px 18px", border: `1px solid ${C.border}` }}>
                        <div style={{ fontSize: 11, color: C.dim, fontFamily: F.sans, marginBottom: 5 }}>{l}</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: c, fontFamily: F.sans }}>{v}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          ) : (
            <Card style={{ textAlign: "center" }}>
              <EmptyState title={wsOk ? "Collecting price history" : "Waiting for market data"} detail="Price estimates appear once enough recent candles are available. The connection retries automatically." />
            </Card>
          )
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* TAB: PERFORMANCE — Stats + Backtest engine            */}
        {/* ══════════════════════════════════════════════════════ */}
        {activeTab === "performance" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {perfStats ? (
              <PerformancePanel stats={perfStats} />
            ) : (
              <Card style={{ textAlign: "center", padding: 36 }}>
                <div role="status" style={{ color: C.dim, fontFamily: F.sans, fontSize: 14 }}>{perfLoading ? `Loading ${activeAsset} signal history…` : `No ${activeAsset} signal history is available yet.`}</div>
              </Card>
            )}
            <Card accent={C.blue}>
              <div className="backtest-toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
                <div>
                  <Label accent={C.blue}>Backtest Engine</Label>
                  <div style={{ color: C.dim, fontSize: 12, fontFamily: F.sans }}>{activeAsset === "BTC" ? "Bitcoin · BTC/USDT" : "Gold proxy · PAXG/USDT"} · {btPeriod} · 1h candles</div>
                </div>
                <div className="backtest-controls" role="group" aria-label="Backtest period and action" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {(["30d", "90d", "180d"] as const).map(p => (
                    <button key={p} type="button" className="app-control" aria-pressed={btPeriod === p} aria-label={`${p.replace("d", " days")} backtest period`} onClick={() => setBtPeriod(p)} style={{ background: btPeriod === p ? "var(--period-selected-bg)" : C.s2, color: btPeriod === p ? "var(--period-selected-text)" : C.dim, border: `1px solid ${btPeriod === p ? "var(--period-selected-border)" : C.border}`, borderRadius: 8, padding: "6px 16px", fontSize: 13, fontFamily: F.sans, cursor: "pointer" }}>{p}</button>
                  ))}
                  <button type="button" className="app-control" onClick={runBacktest} disabled={backtestLoading}>
                    {backtestLoading ? "Running…" : backtestError ? "Retry backtest" : "Run backtest"}
                  </button>
                </div>
              </div>
              {!showBacktest && <div style={{ color: C.dim, fontFamily: F.sans, fontSize: 13 }}>Select a period and click Run Backtest to simulate strategy performance on historical {activeAsset} data (1h candles).</div>}
              {backtestError && <div className="feedback-banner" role="alert" style={{ color: C.amber, fontSize: 13, lineHeight: 1.6 }}>{backtestError}</div>}
              {showBacktest && !backtestError && <div aria-busy={backtestLoading} aria-live="polite"><BacktestPanel result={backtestResult} loading={backtestLoading} /></div>}
            </Card>
          </div>
        )}

        </section>
        <Disclaimer />
        <footer className="workspace-footer"><span>SignalAnalyzer <span aria-hidden="true">·</span> BTC & PAXG</span><span>Browser analysis. Closed-candle signals.</span></footer>
      </main>
      </div>
    </div>
  );
}
