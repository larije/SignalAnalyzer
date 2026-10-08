import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBrowserCandles, fetchBrowserTicker } from '../browserMarket';

afterEach(() => vi.unstubAllGlobals());
const row = (time: number) => [time, '100', '104', '98', '101', '25'];
function response(body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => body });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('browser market boundary', () => {
  it('fetches public candles with the abort signal and requested range, sorted oldest first', async () => {
    const fetchMock = response([row(120_000), row(60_000)]);
    const controller = new AbortController();
    const candles = await fetchBrowserCandles('PAXGUSDT', '1m', 60, controller.signal, 60_000, 179_999);
    expect(candles.map(c => c.time)).toEqual([60_000, 120_000]);
    expect(candles[0]).toEqual({ time: 60_000, open: 100, high: 104, low: 98, close: 101, volume: 25 });
    expect(fetchMock).toHaveBeenCalledWith('https://data-api.binance.vision/api/v3/klines?symbol=PAXGUSDT&interval=1m&limit=60&startTime=60000&endTime=179999', { signal: controller.signal, cache: 'no-store' });
  });
  it.each([
    [[60_000, '100', '99', '98', '101', '25']],
    [[60_000, '100', '104', '98', '', '25']],
    [row(60_000), row(60_000)], [], { code: -1 },
  ])('rejects malformed or ambiguous candle payloads', async raw => {
    response(raw);
    await expect(fetchBrowserCandles('BTCUSDT', '1m', 100)).rejects.toThrow();
  });
  it('rejects unsupported symbols without making a request', async () => {
    const fetchMock = response([]);
    await expect(fetchBrowserCandles('ETHUSDT', '1m', 100)).rejects.toThrow('Unsupported');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('surfaces HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    await expect(fetchBrowserCandles('BTCUSDT', '1m', 100)).rejects.toThrow('429');
  });
  it('validates ticker numbers and market identity', async () => {
    const ticker = { symbol: 'BTCUSDT', lastPrice: '101', openPrice: '100', highPrice: '104', lowPrice: '98', volume: '25', priceChange: '1', priceChangePercent: '1', closeTime: 180_000 };
    response(ticker);
    expect(await fetchBrowserTicker('BTCUSDT')).toMatchObject({ symbol: 'BTCUSDT', price: 101, timestamp: 180_000 });
    response({ ...ticker, symbol: 'PAXGUSDT' });
    await expect(fetchBrowserTicker('BTCUSDT')).rejects.toThrow('Invalid');
    response({ ...ticker, lastPrice: 'NaN' });
    await expect(fetchBrowserTicker('BTCUSDT')).rejects.toThrow('Invalid');
  });
});
