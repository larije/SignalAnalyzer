// Volume Profile: POC, VAH, VAL, HVN, LVN
import type { Candle } from './technicalAnalysis';

export interface VolumeProfileLevel {
  price: number;
  volume: number;
  isHVN: boolean;
  isLVN: boolean;
}

export interface VolumeProfile {
  poc: number;           // Point of Control — price level with highest volume
  vah: number;           // Value Area High — upper bound of 70% volume zone
  val: number;           // Value Area Low — lower bound of 70% volume zone
  hvn: number[];         // High Volume Nodes — price magnets / support-resistance
  lvn: number[];         // Low Volume Nodes — price tends to move through quickly
  totalVolume: number;
  valueAreaPct: number;  // actual % of volume captured (target 70%)
  levels: VolumeProfileLevel[];
}

export function calculateVolumeProfile(candles: Candle[], bins = 30): VolumeProfile {
  const lastPrice = candles[candles.length - 1]?.close ?? 0;
  const empty: VolumeProfile = {
    poc: lastPrice, vah: lastPrice, val: lastPrice,
    hvn: [], lvn: [], totalVolume: 0, valueAreaPct: 0, levels: [],
  };

  if (candles.length < 10) return empty;

  const priceMin = Math.min(...candles.map(c => c.low));
  const priceMax = Math.max(...candles.map(c => c.high));
  const binSize  = (priceMax - priceMin) / bins;
  if (binSize === 0) return empty;

  // Distribute each candle's volume proportionally across the price range it spans
  const volumeByBin = new Array(bins).fill(0);
  for (const c of candles) {
    const startBin = Math.max(0, Math.floor((c.low  - priceMin) / binSize));
    const endBin   = Math.min(bins - 1, Math.floor((c.high - priceMin) / binSize));
    const span     = endBin - startBin + 1;
    const volPerBin = c.volume / span;
    for (let b = startBin; b <= endBin; b++) volumeByBin[b] += volPerBin;
  }

  // POC = bin with maximum volume
  let pocBin = 0;
  for (let i = 1; i < bins; i++) {
    if (volumeByBin[i] > volumeByBin[pocBin]) pocBin = i;
  }
  const poc = priceMin + (pocBin + 0.5) * binSize;

  const totalVolume = volumeByBin.reduce((a, b) => a + b, 0);
  const targetVol   = totalVolume * 0.70;

  // Expand outward from POC, always picking the higher-volume side, until 70% captured
  let vaLow = pocBin, vaHigh = pocBin;
  let vaVol = volumeByBin[pocBin];

  while (vaVol < targetVol && (vaLow > 0 || vaHigh < bins - 1)) {
    const downVol = vaLow  > 0       ? volumeByBin[vaLow  - 1] : -1;
    const upVol   = vaHigh < bins - 1 ? volumeByBin[vaHigh + 1] : -1;
    if (upVol >= downVol) { vaHigh++; vaVol += volumeByBin[vaHigh]; }
    else if (downVol >= 0) { vaLow--;  vaVol += volumeByBin[vaLow];  }
    else break;
  }

  const vah = priceMin + (vaHigh + 1) * binSize;
  const val = priceMin + vaLow * binSize;

  const avgVol = totalVolume / bins;
  const hvn: number[] = [];
  const lvn: number[] = [];
  const levels: VolumeProfileLevel[] = [];

  for (let i = 0; i < bins; i++) {
    const price = priceMin + (i + 0.5) * binSize;
    const isHVN = volumeByBin[i] > avgVol * 1.5;
    const isLVN = totalVolume > 0 && volumeByBin[i] < avgVol * 0.4;
    levels.push({ price, volume: volumeByBin[i], isHVN, isLVN });
    if (isHVN) hvn.push(price);
    if (isLVN) lvn.push(price);
  }

  return {
    poc, vah, val, hvn, lvn, totalVolume,
    valueAreaPct: totalVolume > 0 ? (vaVol / totalVolume) * 100 : 0,
    levels,
  };
}
