import { fetchBrowserCandles } from './browserMarket';

export type ChartAsset = 'BTC' | 'XAU';
export interface ChartCandle { time: number; open: number; high: number; low: number; close: number; volume: number; }
export interface AssetChartState {
  asset: ChartAsset; timeframe: string; candles: ChartCandle[]; loading: boolean; error: string | null;
}

export function selectedChart(state: AssetChartState | null, asset: ChartAsset, timeframe: string) {
  if (timeframe !== '1m' && state?.asset === asset && state.timeframe === timeframe) {
    return { candles: state.candles, loading: state.loading, error: state.error };
  }
  return { candles: [] as ChartCandle[], loading: timeframe !== '1m', error: null as string | null };
}

export async function loadAssetCandles(asset: ChartAsset, timeframe: string, limit: number, signal: AbortSignal): Promise<ChartCandle[]> {
  const symbol = asset === 'BTC' ? 'BTCUSDT' : 'PAXGUSDT';
  return fetchBrowserCandles(symbol, timeframe, limit, signal);
}
