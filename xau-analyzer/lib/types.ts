// ── Canonical types for the XAU/BTC multi-layer trading intelligence engine ──

// ── Base primitives ──────────────────────────────────────────────────────────
export type SignalType = 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL' | 'NO_TRADE';
export type VolatilityRegime = 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
export type MarketStructureType =
  | 'STRONG_UPTREND'
  | 'WEAK_UPTREND'
  | 'RANGE'
  | 'WEAK_DOWNTREND'
  | 'STRONG_DOWNTREND';
export type TradeQuality = 'POOR' | 'GOOD' | 'EXCELLENT';
export type VolumeConfirmation = 'STRONG_BULL' | 'BULL' | 'NEUTRAL' | 'BEAR' | 'STRONG_BEAR';
export type VolumeTrend = 'RISING' | 'FALLING' | 'NEUTRAL';
export type EMAAlignment = 'BULL' | 'BEAR' | 'NEUTRAL';
export type TrendDirection = 'UP' | 'DOWN' | 'SIDEWAYS';
export type MTFBias = 'BULLISH' | 'BEARISH' | 'MIXED';

// ── Volume Analysis (Phase 2) ─────────────────────────────────────────────────
export interface VolumeAnalysis {
  current: number;
  average: number;        // 20-period MA
  ratio: number;          // current / average
  trend: VolumeTrend;
  spike: boolean;         // ratio > 2.0
  confirmation: VolumeConfirmation;
  score: number;          // -15 to +15, fed into signal engine
}

// ── Market Structure (Phase 3) ────────────────────────────────────────────────
export interface MarketStructure {
  type: MarketStructureType;
  recentHH: boolean;       // Higher High
  recentHL: boolean;       // Higher Low
  recentLH: boolean;       // Lower High
  recentLL: boolean;       // Lower Low
  bos: boolean;            // Break of Structure
  choch: boolean;          // Change of Character
  swingHigh: number;
  swingLow: number;
  score: number;           // -20 to +20 (higher weight than RSI/Stoch)
  strength: number;        // 0-100 structure strength
}

// ── Volatility Regime (Phase 5) ───────────────────────────────────────────────
export interface VolatilityAnalysis {
  regime: VolatilityRegime;
  atrPct: number;          // ATR as % of price
  bbWidth: number;         // Bollinger Band width %
  rangeExpansion: boolean; // Recent range > historical avg
  stopMultiplier: number;  // Dynamic ATR multiplier for SL
  tpMultiplier: number;    // Dynamic ATR multiplier for TP
  confidenceAdj: number;   // Confidence adjustment (-10 to +5)
}

// ── Multi-Timeframe Signal (Phase 1) ─────────────────────────────────────────
export interface TimeframeSignal {
  timeframe: string;       // '1 Minute', '5 Minute', etc.
  interval: string;        // '1m', '5m', etc.
  signal: SignalType;
  score: number;           // Raw timeframe score
  emaAlignment: EMAAlignment;
  trend: TrendDirection;
  rsi: number;
  macdBull: boolean;
  priceVsEma9: 'ABOVE' | 'BELOW';
}

export interface MultiTimeframeAnalysis {
  signals: TimeframeSignal[];
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  alignment: number;       // 0-100 % bullish alignment
  confidence: number;      // 0-100 trend confidence
  dominantBias: MTFBias;
  score: number;           // -25 to +25
}

// ── Risk Metrics (Phase 6) ────────────────────────────────────────────────────
export interface RiskMetrics {
  stopLoss: number;
  takeProfit: number;
  stopLoss2: number;       // Wider / secondary SL
  takeProfit2: number;     // Second TP extension target
  riskReward: number;      // TP dist / SL dist
  expectedValue: number;   // Probabilistic EV in price units
  tradeQuality: TradeQuality;
  qualityScore: number;    // 0-100
}

// ── Component score breakdown ─────────────────────────────────────────────────
export interface ComponentScores {
  rsi: number;       // -30 to +30
  macd: number;      // -25 to +25
  bb: number;        // -20 to +20
  ema: number;       // -15 to +15
  stoch: number;     // -10 to +10
  volume: number;    // -15 to +15
  structure: number; // -20 to +20
  mtf: number;       // -25 to +25
}

// ── Volume Profile ────────────────────────────────────────────────────────────
export interface VolumeProfileLevel {
  price: number;
  volume: number;
  isHVN: boolean;
  isLVN: boolean;
}

export interface VolumeProfile {
  poc: number;           // Point of Control — price level with highest volume
  vah: number;           // Value Area High (70% of total volume)
  val: number;           // Value Area Low
  hvn: number[];         // High Volume Nodes (support/resistance magnets)
  lvn: number[];         // Low Volume Nodes (price moves quickly through)
  totalVolume: number;
  valueAreaPct: number;  // % of volume captured by VAH/VAL
  levels: VolumeProfileLevel[];
}

// ── Session Analysis ──────────────────────────────────────────────────────────
export type TradingSession = 'ASIAN' | 'LONDON' | 'NEW_YORK' | 'LONDON_NY_OVERLAP' | 'OFF_HOURS';
export type SessionImpact = 'HIGH' | 'MEDIUM' | 'LOW';

export interface SessionAnalysis {
  currentSession: TradingSession;
  isHighVolatility: boolean;
  sessionHigh: number;
  sessionLow: number;
  sessionRange: number;   // % range
  impact: SessionImpact;
  biasNote: string;
  confidenceAdj: number;  // -8 to +10
}

// ── Pattern Recognition ───────────────────────────────────────────────────────
export type PatternType =
  | 'BULL_FLAG' | 'BEAR_FLAG'
  | 'ASCENDING_TRIANGLE' | 'DESCENDING_TRIANGLE' | 'SYMMETRICAL_TRIANGLE'
  | 'DOUBLE_TOP' | 'DOUBLE_BOTTOM'
  | 'HEAD_AND_SHOULDERS' | 'INVERSE_HEAD_AND_SHOULDERS'
  | 'ASCENDING_CHANNEL' | 'DESCENDING_CHANNEL'
  | 'RISING_WEDGE' | 'FALLING_WEDGE'
  | 'NONE';

export type PatternDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface PatternResult {
  pattern: PatternType;
  confidence: number;        // 0-100
  direction: PatternDirection;
  targetPrice: number;
  invalidationPrice: number;
  description: string;
}

// ── Smart Money Concepts ──────────────────────────────────────────────────────
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
  isMitigated: boolean;
  strength: number;
  candleIndex: number;
}

export interface SmartMoneyAnalysis {
  fvgs: FairValueGap[];
  orderBlocks: OrderBlock[];
  mitigationBlocks: OrderBlock[];
  activeFVG: FairValueGap | null;
  activeOrderBlock: OrderBlock | null;
  institutionalBias: SMCBias;
  liquidityAbove: number[];   // equal-high clusters (buy-stop pools)
  liquidityBelow: number[];   // equal-low clusters (sell-stop pools)
  score: number;              // -15 to +15
}

// ── News Risk Assessment ──────────────────────────────────────────────────────
export type NewsRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';

export interface NewsRiskAssessment {
  riskLevel: NewsRiskLevel;
  score: number;           // 0-100
  upcomingEvents: string[];
  tradingRecommendation: string;
  confidenceAdj: number;   // -20 to 0
  isAcceptable: boolean;   // false blocks STRONG BUY/SELL
  isEstimate: boolean;     // always true: time-based pattern, not a live calendar
}

// ── Market Regime (Phase 21) ──────────────────────────────────────────────────
export type MarketRegime = 'TRENDING' | 'RANGING' | 'COMPRESSION' | 'EXPANSION' | 'REVERSAL';
export type RegimeDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface MarketRegimeAnalysis {
  regime: MarketRegime;
  direction: RegimeDirection;
  strength: number;          // 0-100 confidence in regime classification
  multiplier: number;        // actual multiplier applied to raw signal score
  description: string;
  compatibilityNote: string;
}

// ── Correlation Analysis ──────────────────────────────────────────────────────
export interface CorrelationAnalysis {
  btcXauCorrelation: number;
  xauDxyNote: string;
  xauUs10yNote: string;
  btcNasdaqNote: string;
  btcEthNote: string;
  crossAssetScore: number;   // -10 to +10
  summary: string;
}

// ── Enhanced Trading Signal (all phases combined) ─────────────────────────────
export interface EnhancedTradingSignal {
  // Core (backward-compatible with TradingSignal)
  signal: SignalType;
  confidence: number;      // 0-100 dynamic confidence (Phase 4)
  score: number;           // -100 to +100 raw composite score
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  reasons: string[];
  // Phase enhancements
  volumeAnalysis: VolumeAnalysis;
  marketStructure: MarketStructure;
  volatility: VolatilityAnalysis;
  mtfAnalysis: MultiTimeframeAnalysis;
  riskMetrics: RiskMetrics;
  componentScores: ComponentScores;
  // New institutional modules
  volumeProfile: VolumeProfile;
  sessionAnalysis: SessionAnalysis;
  patternResult: PatternResult;
  smartMoney: SmartMoneyAnalysis;
  newsRisk: NewsRiskAssessment;
  correlations: CorrelationAnalysis;
  // Phase 21: Market Regime
  marketRegime: MarketRegimeAnalysis;
  // Phase 22: Learning System (optional — populated once history exists)
  mlProbability?: import('./patternDatabase').MLProbability;
  adaptiveWeights?: import('./patternDatabase').AdaptiveWeights;
  // Strict gate metadata
  strongSignalGatePassed: boolean;
  gateFailReasons: string[];
}

// ── Phase 22: Learning System ─────────────────────────────────────────────────
// Re-export from patternDatabase so consumers import only from './types'
export type { TradeFeatures, EnrichedTradeRecord, MLProbability, AdaptiveWeights } from './patternDatabase';

// ── Signal History (Phase 7) ──────────────────────────────────────────────────
export interface SignalHistoryEntry {
  id: string;
  timestamp: number;
  asset: string;
  signal: SignalType;
  score: number;
  confidence: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  outcome: 'WIN' | 'LOSS' | 'TIMEOUT' | 'PENDING';
  exitPrice?: number;
  pnl?: number;            // Price units
  pnlPct?: number;         // Percentage
  holdMinutes?: number;
}

export interface PerformanceStats {
  totalSignals: number;
  completedSignals: number;
  pendingSignals: number;
  timeouts: number;
  winRate: number;
  lossRate: number;
  profitFactor: number;
  avgRR: number;
  expectancy: number;      // avg pnlPct
  maxDrawdown: number;
  netPnlPct: number;
  sharpeRatio: number;
  bestTrade: number;
  worstTrade: number;
}

// ── Backtesting (Phase 8) ─────────────────────────────────────────────────────
export type BacktestPeriod = '30d' | '90d' | '180d' | '365d';

export interface BacktestTrade {
  entryTime: number;
  exitTime: number;
  signal: SignalType;
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit: number;
  outcome: 'WIN' | 'LOSS' | 'TIMEOUT';
  pnl: number;
  pnlPct: number;
  holdMinutes: number;
  score: number;
}

export interface BacktestResult {
  period: BacktestPeriod;
  asset: string;
  interval: string;
  totalTrades: number;
  wins: number;
  losses: number;
  timeouts: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  netPnlPct: number;
  avgTradePct: number;
  avgHoldMinutes: number;
  avgScore: number;
  trades: BacktestTrade[];
}
