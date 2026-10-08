import { afterEach, describe, expect, it, vi } from 'vitest';
import { runBacktest } from '../backtesting';

afterEach(() => vi.unstubAllGlobals());

describe('browser backtest data loading', () => {
  it('uses the public market-data endpoint and surfaces HTTP errors', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 451 });
    vi.stubGlobal('fetch', fetch);
    await expect(runBacktest('BTCUSDT', '30d')).rejects.toThrow('HTTP 451');
    expect(fetch.mock.calls[0][0]).toMatch(/^https:\/\/data-api\.binance\.vision\/api\/v3\/klines\?/);
  });

  it('does not report empty success when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')));
    await expect(runBacktest('PAXGUSDT', '30d')).rejects.toThrow('Offline');
  });

  it('rejects malformed prices instead of simulating invalid candles', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [['1', 'bad', '100', '99', '100', '10']] }));
    await expect(runBacktest('BTCUSDT', '30d')).rejects.toThrow();
  });

  it('does not silently simulate a partial period when a later page fails', async () => {
    const page = Array.from({ length: 1000 }, (_, i) => [String(i * 3_600_000), '100', '101', '99', '100', '10']);
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => page })
      .mockResolvedValueOnce({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetch);
    await expect(runBacktest('BTCUSDT', '90d')).rejects.toThrow('HTTP 503');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
