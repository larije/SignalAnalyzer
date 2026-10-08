// News Risk Assessment — time-based high-impact event detection
// Uses known economic calendar patterns since no live news API is available.

export type NewsRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';

export interface NewsRiskAssessment {
  riskLevel: NewsRiskLevel;
  score: number;           // 0-100 (higher = more risk to open new positions)
  upcomingEvents: string[];
  tradingRecommendation: string;
  confidenceAdj: number;   // -20 to 0 subtracted from signal confidence
  isAcceptable: boolean;   // gates STRONG BUY/SELL signals
  isEstimate: boolean;     // always true: derived from time-of-day patterns, not a live calendar
}

interface RiskWindow {
  label: string;
  points: number;
  check: (h: number, m: number, dow: number, dom: number) => boolean;
}

const RISK_WINDOWS: RiskWindow[] = [
  // NFP: First Friday 12:30-14:00 UTC
  {
    label: 'NFP — Non-Farm Payrolls (extreme volatility)',
    points: 65,
    // 08:30 ET = 12:30 UTC (DST) or 13:30 UTC (winter) — accept both hours.
    check: (h, m, dow, dom) => dow === 5 && dom <= 7 && (h === 12 || h === 13) && m >= 20,
  },
  {
    label: 'NFP window active (post-release volatility)',
    points: 45,
    check: (h, _, dow, dom) => dow === 5 && dom <= 7 && h >= 13 && h < 15,
  },
  // FOMC: 3rd Wednesday 18:00-19:30 UTC (approx)
  {
    label: 'FOMC Rate Decision window (18:00 UTC Wed)',
    points: 60,
    check: (h, _, dow, dom) => dow === 3 && dom >= 15 && dom <= 22 && h >= 17 && h < 20,
  },
  // CPI: 2nd Tuesday/Wednesday 12:30 UTC
  {
    label: 'CPI Release window (12:30 UTC)',
    points: 50,
    check: (h, m, dow, dom) => (dow === 2 || dow === 3) && dom >= 10 && dom <= 17 && (h === 12 || h === 13) && m >= 20,
  },
  // PPI: similar window to CPI
  {
    label: 'PPI/PCE data window — inflation print',
    points: 35,
    check: (h, m, dow, dom) => (dow === 2 || dow === 4 || dow === 5) && dom >= 25 && (h === 12 || h === 13) && m >= 20 && m <= 50,
  },
  // London open volatility grab
  {
    label: 'London open 08:00-08:30 UTC — initial direction may reverse',
    points: 18,
    check: (h, m, dow) => dow >= 1 && dow <= 5 && h === 8 && m <= 30,
  },
  // NY open fakeout window
  {
    label: 'NY open 13:30-14:00 UTC — watch for fakeout move',
    points: 22,
    check: (h, m, dow) => dow >= 1 && dow <= 5 && h === 13 && m >= 25 && m <= 55,
  },
  // Asian open liquidity sweep
  {
    label: 'Asian open 00:00-00:30 UTC — liquidity sweep risk',
    points: 15,
    check: (h, m) => h === 0 && m <= 30,
  },
  // Friday close
  {
    label: 'Friday close — institutional position squaring',
    points: 20,
    check: (h, _, dow) => dow === 5 && h >= 18,
  },
  // Weekend
  {
    label: 'Weekend — thin liquidity, Sunday gap risk',
    points: 30,
    check: (_, __, dow) => dow === 6 || dow === 0,
  },
];

/** Assess news risk for a given moment (UTC). Time-based estimate, not a live calendar. */
export function assessNewsRiskAt(now: Date): NewsRiskAssessment {
  const h    = now.getUTCHours();
  const m    = now.getUTCMinutes();
  const dow  = now.getUTCDay();   // 0=Sun … 6=Sat
  const dom  = now.getUTCDate();

  const triggered: RiskWindow[] = RISK_WINDOWS.filter(w => w.check(h, m, dow, dom));
  const rawScore = triggered.reduce((s, w) => s + w.points, 10); // 10 baseline
  const score    = Math.min(100, rawScore);

  const upcomingEvents = triggered.length > 0
    ? triggered.map(w => w.label)
    : ['No known high-impact events in this window'];

  let riskLevel: NewsRiskLevel;
  let confidenceAdj: number;
  let tradingRecommendation: string;
  let isAcceptable: boolean;

  if (score >= 70) {
    riskLevel              = 'EXTREME';
    confidenceAdj          = -20;
    tradingRecommendation  = 'AVOID — High-impact event active. Close or flatten positions; do not open new trades.';
    isAcceptable           = false;
  } else if (score >= 40) {
    riskLevel              = 'HIGH';
    confidenceAdj          = -12;
    tradingRecommendation  = 'CAUTION — Reduce position size 50%. Use ATR×2 stops. Avoid STRONG signals.';
    isAcceptable           = false;
  } else if (score >= 22) {
    riskLevel              = 'MEDIUM';
    confidenceAdj          = -5;
    tradingRecommendation  = 'MANAGEABLE — Trade with normal caution; tighter risk sizing recommended.';
    isAcceptable           = true;
  } else {
    riskLevel              = 'LOW';
    confidenceAdj          = 0;
    tradingRecommendation  = 'CLEAR — Normal trading conditions. Full signal weight applies.';
    isAcceptable           = true;
  }

  return { riskLevel, score, upcomingEvents, tradingRecommendation, confidenceAdj, isAcceptable, isEstimate: true };
}

/** Assess news risk for the current moment. */
export function assessNewsRisk(): NewsRiskAssessment {
  return assessNewsRiskAt(new Date());
}
