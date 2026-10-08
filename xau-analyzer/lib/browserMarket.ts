import type { Candle } from './technicalAnalysis';
import type { TickerData } from './binanceService';

const MARKET_URL = 'https://data-api.binance.vision/api/v3';
const SYMBOLS = new Set(['BTCUSDT', 'PAXGUSDT']);
export const BROWSER_INTERVAL_MS: Readonly<Record<string, number>> = {
  '1m': 60_000, '5m': 300_000, '15m': 900_000,
  '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000,
};

function symbolParam(symbol: string): string {
  if (!SYMBOLS.has(symbol)) throw new Error('Unsupported market symbol.');
  return symbol;
}

function number(value: unknown): number {
  if ((typeof value !== 'string' && typeof value !== 'number') || value === '') return NaN;
  return Number(value);
}

async function request(path: string, params: URLSearchParams, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(`${MARKET_URL}/${path}?${params}`, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error(`Market data request failed (${response.status}).`);
  return response.json();
}

/** Public market data only; no user credentials or private account endpoints. */
export async function fetchBrowserCandles(
  symbol: string, interval: string, limit: number, signal?: AbortSignal,
  startTime?: number, endTime?: number,
): Promise<Candle[]> {
  if (!BROWSER_INTERVAL_MS[interval]) throw new Error('Unsupported chart interval.');
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Invalid candle limit.');
  const params = new URLSearchParams({ symbol: symbolParam(symbol), interval, limit: String(limit) });
  for (const [key, value] of [['startTime', startTime], ['endTime', endTime]] as const) {
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid candle time range.');
    params.set(key, String(value));
  }
  if (startTime !== undefined && endTime !== undefined && startTime > endTime) throw new Error('Invalid candle time range.');
  const raw = await request('klines', params, signal);
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('Market candle data is unavailable.');
  const candles: Candle[] = raw.map(row => {
    if (!Array.isArray(row) || row.length < 6) throw new Error('Invalid market candle data.');
    const [time, open, high, low, close, volume] = row.slice(0, 6).map(number);
    if (![time, open, high, low, close, volume].every(Number.isFinite)
      || !Number.isSafeInteger(time) || time < 0 || time % BROWSER_INTERVAL_MS[interval] !== 0
      || open <= 0 || high <= 0 || low <= 0 || close <= 0 || volume < 0
      || high < Math.max(open, close, low) || low > Math.min(open, close, high)) {
      throw new Error('Invalid market candle data.');
    }
    return { time, open, high, low, close, volume };
  }).sort((a, b) => a.time - b.time);
  if (candles.some((candle, index) => index > 0 && candle.time === candles[index - 1].time)) {
    throw new Error('Duplicate market candle timestamps.');
  }
  return candles;
}

export async function fetchBrowserTicker(symbol: string, signal?: AbortSignal): Promise<TickerData> {
  const raw = await request('ticker/24hr', new URLSearchParams({ symbol: symbolParam(symbol) }), signal);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid market ticker data.');
  const value = raw as Record<string, unknown>;
  const ticker: TickerData = {
    symbol, price: number(value.lastPrice), open: number(value.openPrice),
    high: number(value.highPrice), low: number(value.lowPrice), volume: number(value.volume),
    change: number(value.priceChange), changePercent: number(value.priceChangePercent), timestamp: number(value.closeTime),
  };
  if (value.symbol !== symbol || !Object.values(ticker).filter(v => typeof v === 'number').every(Number.isFinite)
    || ticker.price <= 0 || ticker.open <= 0 || ticker.low <= 0 || ticker.volume < 0
    || ticker.high < Math.max(ticker.price, ticker.open, ticker.low)
    || ticker.low > Math.min(ticker.price, ticker.open, ticker.high)
    || !Number.isSafeInteger(ticker.timestamp) || ticker.timestamp < 0) throw new Error('Invalid market ticker data.');
  return ticker;
}
