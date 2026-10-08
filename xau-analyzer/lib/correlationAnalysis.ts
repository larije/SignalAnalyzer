// Correlation Analysis: BTC/XAU rolling correlation + qualitative DXY/US10Y/Nasdaq/ETH
import type { Candle } from './technicalAnalysis';

export interface CorrelationAnalysis {
  btcXauCorrelation: number;  // -1 to +1 rolling Pearson correlation
  xauDxyNote: string;
  xauUs10yNote: string;
  btcNasdaqNote: string;
  btcEthNote: string;
  crossAssetScore: number;    // -10 to +10 fed into signal
  summary: string;
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 5) return 0;
  const as = a.slice(-n), bs = b.slice(-n);
  const aMean = as.reduce((s, x) => s + x, 0) / n;
  const bMean = bs.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (as[i] - aMean) * (bs[i] - bMean);
    da  += (as[i] - aMean) ** 2;
    db  += (bs[i] - bMean) ** 2;
  }
  const den = Math.sqrt(da * db);
  return den > 0 ? +(num / den).toFixed(3) : 0;
}

/** Convert a price series to log returns. */
function toLogReturns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0 && prices[i] > 0) out.push(Math.log(prices[i] / prices[i - 1]));
  }
  return out;
}

/**
 * Correlate two price series by their RETURNS, not raw levels.
 * Correlating price levels of two trending series is spurious; returns are the
 * stationary quantity you actually want. Returns 0 with fewer than 10 overlapping returns.
 */
export function pearsonReturns(a: number[], b: number[]): number {
  const ra = toLogReturns(a);
  const rb = toLogReturns(b);
  const n = Math.min(ra.length, rb.length);
  if (n < 10) return 0;
  return pearson(ra.slice(-n), rb.slice(-n));
}

export function analyzeCorrelations(
  btcCandles: Candle[],
  xauCandles: Candle[],
  asset: 'BTC' | 'XAU',
): CorrelationAnalysis {
  const minLen     = Math.min(btcCandles.length, xauCandles.length, 200);
  const btcPrices  = btcCandles.slice(-minLen).map(c => c.close);
  const xauPrices  = xauCandles.slice(-minLen).map(c => c.close);
  const corr       = pearsonReturns(btcPrices, xauPrices);

  const corrLabel  =
    Math.abs(corr) > 0.7 ? 'STRONG'   :
    Math.abs(corr) > 0.4 ? 'MODERATE' : 'WEAK';
  const corrDir    = corr > 0 ? 'positive' : 'inverse';

  // Derive BTC trend from recent closes
  const btcRecent   = btcPrices.slice(-10);
  const btcTrendPct = btcRecent.length >= 2
    ? (btcRecent[btcRecent.length - 1] - btcRecent[0]) / btcRecent[0] * 100
    : 0;
  const btcTrend: 'UP' | 'DOWN' | 'FLAT' =
    btcTrendPct > 0.5 ? 'UP' : btcTrendPct < -0.5 ? 'DOWN' : 'FLAT';

  // ── Qualitative macro notes ──────────────────────────────────

  const xauDxyNote =
    btcTrend === 'UP'
      ? 'Risk-on environment suggests possible DXY softness → tailwind for XAU (inverse correlation ~−0.75)'
      : btcTrend === 'DOWN'
      ? 'Risk-off flight may strengthen DXY → potential headwind for XAU'
      : 'DXY neutral — external feed required for precision (XAU/DXY inverse corr ~−0.75 historically)';

  const xauUs10yNote =
    'US10Y requires external feed — rising real yields typically weigh on XAU; falling yields are bullish for gold';

  const btcNasdaqNote =
    btcTrend === 'UP'
      ? 'BTC uptrend signals risk appetite — Nasdaq likely supportive (BTC/Nasdaq corr ~+0.65)'
      : btcTrend === 'DOWN'
      ? 'BTC weakness implies broad risk-off — Nasdaq likely under pressure'
      : 'BTC/Nasdaq correlation ~+0.65 historically; real-time Nasdaq data not available';

  const btcEthNote =
    `BTC/ETH historical correlation ~0.87; ETH typically follows BTC with a 1-4 hour lag. ` +
    (btcTrend === 'UP' ? 'Current BTC uptrend → ETH likely to follow.' :
     btcTrend === 'DOWN' ? 'Current BTC weakness → ETH likely to underperform.' :
     'ETH neutral — watch BTC for directional lead.');

  // ── Cross-asset score ─────────────────────────────────────────
  let crossAssetScore = 0;

  if (asset === 'XAU') {
    if (btcTrend === 'UP'   && corr > 0.4)  crossAssetScore += 4;  // correlated risk-on
    if (btcTrend === 'DOWN' && corr < -0.4) crossAssetScore += 3;  // inverse → XAU safe-haven
    if (btcTrend === 'DOWN' && corr > 0.4)  crossAssetScore -= 4;  // correlated drop
  } else {
    if (btcTrend === 'UP')   crossAssetScore += 5;                  // Nasdaq/ETH tailwind
    if (btcTrend === 'DOWN') crossAssetScore -= 5;
  }

  crossAssetScore = Math.max(-10, Math.min(10, crossAssetScore));

  const summary =
    `BTC/PAXG return correlation (${minLen}-candle): ${corr > 0 ? '+' : ''}${corr} (${corrLabel} ${corrDir}) | ` +
    `BTC 10-candle trend: ${btcTrend} (${btcTrendPct.toFixed(2)}%)`;

  // The macro notes below are static reference context, NOT live data feeds.
  const ref = '(reference only — no live data) ';

  return {
    btcXauCorrelation: corr,
    xauDxyNote:   ref + xauDxyNote,
    xauUs10yNote: ref + xauUs10yNote,
    btcNasdaqNote: ref + btcNasdaqNote,
    btcEthNote:   ref + btcEthNote,
    crossAssetScore,
    summary,
  };
}
