// Session Analysis: Asian, London, New York, London/NY Overlap
import type { Candle } from './technicalAnalysis';

export type TradingSession = 'ASIAN' | 'LONDON' | 'NEW_YORK' | 'LONDON_NY_OVERLAP' | 'OFF_HOURS';
export type SessionImpact = 'HIGH' | 'MEDIUM' | 'LOW';

export interface SessionAnalysis {
  currentSession: TradingSession;
  isHighVolatility: boolean;
  sessionHigh: number;
  sessionLow: number;
  sessionRange: number;   // % high-to-low range
  impact: SessionImpact;
  biasNote: string;
  confidenceAdj: number;  // -8 to +10 added to signal confidence
}

/** UTC hour boundaries for each session */
const SESSIONS = {
  ASIAN:              { start: 0,  end: 8  },
  LONDON:             { start: 8,  end: 13 },
  LONDON_NY_OVERLAP:  { start: 13, end: 16 },
  NEW_YORK:           { start: 16, end: 21 },
  // 21-24 UTC = off hours
} as const;

export function analyzeSession(candles: Candle[]): SessionAnalysis {
  return analyzeSessionAt(new Date(), candles);
}

export function analyzeSessionAt(now: Date, candles: Candle[]): SessionAnalysis {
  const utcHour = now.getUTCHours();

  let session: TradingSession;
  let impact: SessionImpact;
  let biasNote: string;
  let confidenceAdj: number;

  if (utcHour >= SESSIONS.LONDON_NY_OVERLAP.start && utcHour < SESSIONS.LONDON_NY_OVERLAP.end) {
    session       = 'LONDON_NY_OVERLAP';
    impact        = 'HIGH';
    biasNote      = 'London/NY overlap 13:00-16:00 UTC — peak institutional liquidity; most reliable breakout window';
    confidenceAdj = 10;
  } else if (utcHour >= SESSIONS.LONDON.start && utcHour < SESSIONS.LONDON.end) {
    session       = 'LONDON';
    impact        = 'HIGH';
    biasNote      = 'London session 08:00-13:00 UTC — primary trend often established; high institutional flow';
    confidenceAdj = 8;
  } else if (utcHour >= SESSIONS.NEW_YORK.start && utcHour < SESSIONS.NEW_YORK.end) {
    session       = 'NEW_YORK';
    impact        = 'MEDIUM';
    biasNote      = 'New York session 16:00-21:00 UTC — active but fading London volume; watch NY-specific reversals';
    confidenceAdj = 4;
  } else if (utcHour >= SESSIONS.ASIAN.start && utcHour < SESSIONS.ASIAN.end) {
    session       = 'ASIAN';
    impact        = 'LOW';
    biasNote      = 'Asian session 00:00-08:00 UTC — lower volatility, range-bound; avoid chasing breakouts';
    confidenceAdj = -5;
  } else {
    session       = 'OFF_HOURS';
    impact        = 'LOW';
    biasNote      = 'Off-hours 21:00-00:00 UTC — thin liquidity; signals unreliable; hold existing positions only';
    confidenceAdj = -8;
  }

  // Range stats from the last 2 hours of 1m candles (120 candles)
  const recentCandles = candles.slice(-120);
  const sessionHigh  = recentCandles.length > 0 ? Math.max(...recentCandles.map(c => c.high)) : 0;
  const sessionLow   = recentCandles.length > 0 ? Math.min(...recentCandles.map(c => c.low))  : 0;
  const sessionRange = sessionLow > 0 ? ((sessionHigh - sessionLow) / sessionLow) * 100 : 0;
  const isHighVolatility = sessionRange > 0.5; // >0.5% range = elevated volatility

  return { currentSession: session, isHighVolatility, sessionHigh, sessionLow, sessionRange, impact, biasNote, confidenceAdj };
}

export function sessionLabel(s: TradingSession): string {
  switch (s) {
    case 'ASIAN':            return '🌏 Asian';
    case 'LONDON':           return '🇬🇧 London';
    case 'NEW_YORK':         return '🗽 New York';
    case 'LONDON_NY_OVERLAP':return '🔥 London/NY';
    case 'OFF_HOURS':        return '🌙 Off-Hours';
  }
}
