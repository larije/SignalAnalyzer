// Pattern Recognition: Bull/Bear Flags, Triangles, Double Top/Bottom, H&S, Channels, Wedges
import type { Candle } from './technicalAnalysis';

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

// ── Helpers ─────────────────────────────────────────────────────────────────

interface Pivot { idx: number; price: number; }

function findPivots(candles: Candle[], window = 3): { highs: Pivot[]; lows: Pivot[] } {
  const highs: Pivot[] = [];
  const lows:  Pivot[] = [];
  for (let i = window; i < candles.length - window; i++) {
    let isHigh = true, isLow = true;
    for (let j = i - window; j <= i + window; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low  <= candles[i].low)  isLow  = false;
    }
    if (isHigh) highs.push({ idx: i, price: candles[i].high });
    if (isLow)  lows.push({ idx: i, price: candles[i].low  });
  }
  return { highs, lows };
}

function linearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  let ssXX = 0, ssXY = 0;
  for (let i = 0; i < n; i++) {
    ssXX += (i - xMean) ** 2;
    ssXY += (i - xMean) * (values[i] - yMean);
  }
  return ssXX > 0 ? ssXY / ssXX : 0;
}

// ── Main detector ────────────────────────────────────────────────────────────

export function detectPattern(candles: Candle[]): PatternResult {
  const lastClose = candles[candles.length - 1]?.close ?? 0;
  const none: PatternResult = {
    pattern: 'NONE', confidence: 0, direction: 'NEUTRAL',
    targetPrice: lastClose, invalidationPrice: lastClose,
    description: 'No recognizable pattern detected',
  };

  if (candles.length < 30) return none;

  const price = lastClose;
  const { highs, lows } = findPivots(candles, 3);

  // Each candidate carries a priority so we pick the highest-priority match
  const candidates: (PatternResult & { priority: number })[] = [];

  // ── Double Top ──────────────────────────────────────────────
  if (highs.length >= 2) {
    const h1 = highs[highs.length - 2];
    const h2 = highs[highs.length - 1];
    const spread = Math.abs(h1.price - h2.price) / h1.price;
    if (spread < 0.005 && h2.idx > h1.idx + 3) {         // peaks within 0.5%
      const valley = candles.slice(h1.idx, h2.idx + 1);
      const neckline = Math.min(...valley.map(c => c.low));
      if (price <= neckline) {
        const conf = Math.round((1 - spread / 0.005) * 85 + 10);
        candidates.push({
          pattern: 'DOUBLE_TOP', confidence: Math.min(95, conf), direction: 'BEARISH',
          targetPrice: neckline - (h1.price - neckline),
          invalidationPrice: Math.max(h1.price, h2.price) * 1.002,
          description: `Double top $${h1.price.toFixed(2)}/$${h2.price.toFixed(2)}; neckline break at $${neckline.toFixed(2)}`,
          priority: 92,
        });
      }
    }
  }

  // ── Double Bottom ───────────────────────────────────────────
  if (lows.length >= 2) {
    const l1 = lows[lows.length - 2];
    const l2 = lows[lows.length - 1];
    const spread = Math.abs(l1.price - l2.price) / l1.price;
    if (spread < 0.005 && l2.idx > l1.idx + 3) {
      const peak = candles.slice(l1.idx, l2.idx + 1);
      const neckline = Math.max(...peak.map(c => c.high));
      if (price >= neckline) {
        const conf = Math.round((1 - spread / 0.005) * 85 + 10);
        candidates.push({
          pattern: 'DOUBLE_BOTTOM', confidence: Math.min(95, conf), direction: 'BULLISH',
          targetPrice: neckline + (neckline - l1.price),
          invalidationPrice: Math.min(l1.price, l2.price) * 0.998,
          description: `Double bottom $${l1.price.toFixed(2)}/$${l2.price.toFixed(2)}; neckline breakout at $${neckline.toFixed(2)}`,
          priority: 92,
        });
      }
    }
  }

  // ── Head & Shoulders ────────────────────────────────────────
  if (highs.length >= 3) {
    const ls = highs[highs.length - 3];
    const hd = highs[highs.length - 2];
    const rs = highs[highs.length - 1];
    const symm = 1 - Math.abs(ls.price - rs.price) / ls.price;
    if (hd.price > ls.price && hd.price > rs.price && symm > 0.97) {
      const leftTrough  = Math.min(...candles.slice(ls.idx, hd.idx + 1).map(c => c.low));
      const rightTrough = Math.min(...candles.slice(hd.idx, rs.idx + 1).map(c => c.low));
      const neckline = Math.min(leftTrough, rightTrough);
      if (price < neckline) {
        const conf = Math.min(96, Math.round(symm * 80 + 15));
        candidates.push({
          pattern: 'HEAD_AND_SHOULDERS', confidence: conf, direction: 'BEARISH',
          targetPrice: neckline - (hd.price - neckline),
          invalidationPrice: rs.price * 1.002,
          description: `H&S: LS $${ls.price.toFixed(2)} | Head $${hd.price.toFixed(2)} | RS $${rs.price.toFixed(2)}; neckline $${neckline.toFixed(2)}`,
          priority: 96,
        });
      }
    }
  }

  // ── Inverse Head & Shoulders ─────────────────────────────────
  if (lows.length >= 3) {
    const ls = lows[lows.length - 3];
    const hd = lows[lows.length - 2];
    const rs = lows[lows.length - 1];
    const symm = 1 - Math.abs(ls.price - rs.price) / ls.price;
    if (hd.price < ls.price && hd.price < rs.price && symm > 0.97) {
      const leftPeak  = Math.max(...candles.slice(ls.idx, hd.idx + 1).map(c => c.high));
      const rightPeak = Math.max(...candles.slice(hd.idx, rs.idx + 1).map(c => c.high));
      const neckline  = Math.max(leftPeak, rightPeak);
      if (price > neckline) {
        const conf = Math.min(96, Math.round(symm * 80 + 15));
        candidates.push({
          pattern: 'INVERSE_HEAD_AND_SHOULDERS', confidence: conf, direction: 'BULLISH',
          targetPrice: neckline + (neckline - hd.price),
          invalidationPrice: rs.price * 0.998,
          description: `Inv H&S: LS $${ls.price.toFixed(2)} | Head $${hd.price.toFixed(2)} | RS $${rs.price.toFixed(2)}; neckline $${neckline.toFixed(2)}`,
          priority: 96,
        });
      }
    }
  }

  // ── Bull / Bear Flag ─────────────────────────────────────────
  if (candles.length >= 25) {
    const poleLen = 8;
    const flagLen = 15;
    const poleC   = candles.slice(-poleLen - flagLen, -flagLen);
    const flagC   = candles.slice(-flagLen);

    if (poleC.length >= 4 && flagC.length >= 5) {
      const poleMove = (poleC[poleC.length - 1].close - poleC[0].open) / Math.abs(poleC[0].open);

      // Bull flag
      if (poleMove > 0.015) {
        const hSlope = linearSlope(flagC.map(c => c.high));
        const lSlope = linearSlope(flagC.map(c => c.low));
        if (hSlope < 0 && lSlope < 0 && Math.abs(hSlope) < Math.abs(poleMove) * 0.6) {
          const poleHeight = poleC[poleC.length - 1].close - poleC[0].open;
          candidates.push({
            pattern: 'BULL_FLAG', confidence: Math.min(85, 50 + Math.round(poleMove * 2000)),
            direction: 'BULLISH',
            targetPrice: price + poleHeight,
            invalidationPrice: Math.min(...flagC.map(c => c.low)) * 0.999,
            description: `Bull flag: ${(poleMove * 100).toFixed(1)}% pole, ${flagLen}-candle downward drift consolidation`,
            priority: 78,
          });
        }
      }

      // Bear flag
      if (poleMove < -0.015) {
        const hSlope = linearSlope(flagC.map(c => c.high));
        const lSlope = linearSlope(flagC.map(c => c.low));
        if (hSlope > 0 && lSlope > 0 && hSlope < Math.abs(poleMove) * 0.6) {
          const poleHeight = poleC[poleC.length - 1].close - poleC[0].open;
          candidates.push({
            pattern: 'BEAR_FLAG', confidence: Math.min(85, 50 + Math.round(Math.abs(poleMove) * 2000)),
            direction: 'BEARISH',
            targetPrice: price + poleHeight,
            invalidationPrice: Math.max(...flagC.map(c => c.high)) * 1.001,
            description: `Bear flag: ${(poleMove * 100).toFixed(1)}% pole, ${flagLen}-candle upward drift consolidation`,
            priority: 78,
          });
        }
      }
    }
  }

  // ── Triangles & Wedges (trendline based) ─────────────────────
  if (highs.length >= 3 && lows.length >= 3) {
    const rh = highs.slice(-4);
    const rl = lows.slice(-4);
    const hSlope = linearSlope(rh.map(p => p.price));
    const lSlope = linearSlope(rl.map(p => p.price));

    const resistance = rh.reduce((a, b) => a + b.price, 0) / rh.length;
    const support    = rl.reduce((a, b) => a + b.price, 0) / rl.length;

    // Ascending triangle: flat highs + rising lows
    if (Math.abs(hSlope) < 0.5 && lSlope > 0.5) {
      candidates.push({
        pattern: 'ASCENDING_TRIANGLE', confidence: 72, direction: 'BULLISH',
        targetPrice: resistance + (resistance - support),
        invalidationPrice: rl[rl.length - 1].price * 0.998,
        description: `Ascending triangle: flat resistance ~$${resistance.toFixed(2)}, rising support`,
        priority: 72,
      });
    }

    // Descending triangle: declining highs + flat lows
    if (hSlope < -0.5 && Math.abs(lSlope) < 0.5) {
      candidates.push({
        pattern: 'DESCENDING_TRIANGLE', confidence: 72, direction: 'BEARISH',
        targetPrice: support - (resistance - support),
        invalidationPrice: rh[rh.length - 1].price * 1.002,
        description: `Descending triangle: declining highs, flat support ~$${support.toFixed(2)}`,
        priority: 72,
      });
    }

    // Symmetrical triangle: converging highs & lows
    if (hSlope < -0.2 && lSlope > 0.2) {
      candidates.push({
        pattern: 'SYMMETRICAL_TRIANGLE', confidence: 62, direction: 'NEUTRAL',
        targetPrice: (resistance + support) / 2,
        invalidationPrice: price,
        description: 'Symmetrical triangle: converging trendlines — await directional breakout',
        priority: 62,
      });
    }

    // Rising wedge: both slopes positive but converging (lSlope > hSlope)
    if (hSlope > 0.3 && lSlope > 0.3 && lSlope > hSlope) {
      candidates.push({
        pattern: 'RISING_WEDGE', confidence: 70, direction: 'BEARISH',
        targetPrice: rl[0].price,
        invalidationPrice: rh[rh.length - 1].price * 1.002,
        description: `Rising wedge: narrowing upward channel — bearish reversal when support breaks`,
        priority: 74,
      });
    }

    // Falling wedge: both slopes negative but converging (hSlope < lSlope)
    if (hSlope < -0.3 && lSlope < -0.3 && hSlope < lSlope) {
      candidates.push({
        pattern: 'FALLING_WEDGE', confidence: 70, direction: 'BULLISH',
        targetPrice: rh[0].price,
        invalidationPrice: rl[rl.length - 1].price * 0.998,
        description: `Falling wedge: narrowing downward channel — bullish reversal when resistance breaks`,
        priority: 74,
      });
    }

    // Ascending channel: parallel positive slopes
    if (hSlope > 0.2 && lSlope > 0.2 && Math.abs(hSlope - lSlope) / (Math.abs(hSlope) + 0.001) < 0.4) {
      candidates.push({
        pattern: 'ASCENDING_CHANNEL', confidence: 65, direction: 'BULLISH',
        targetPrice: rh[rh.length - 1].price,
        invalidationPrice: rl[rl.length - 1].price * 0.998,
        description: 'Ascending channel: parallel uptrend trendlines; buy near lower rail',
        priority: 62,
      });
    }

    // Descending channel: parallel negative slopes
    if (hSlope < -0.2 && lSlope < -0.2 && Math.abs(hSlope - lSlope) / (Math.abs(hSlope) + 0.001) < 0.4) {
      candidates.push({
        pattern: 'DESCENDING_CHANNEL', confidence: 65, direction: 'BEARISH',
        targetPrice: rl[rl.length - 1].price,
        invalidationPrice: rh[rh.length - 1].price * 1.002,
        description: 'Descending channel: parallel downtrend trendlines; sell near upper rail',
        priority: 62,
      });
    }
  }

  if (candidates.length === 0) return none;

  // Return the highest-priority candidate
  candidates.sort((a, b) => b.priority - a.priority);
  const best = candidates[0];
  return {
    pattern:            best.pattern,
    confidence:         best.confidence,
    direction:          best.direction,
    targetPrice:        best.targetPrice,
    invalidationPrice:  best.invalidationPrice,
    description:        best.description,
  };
}
