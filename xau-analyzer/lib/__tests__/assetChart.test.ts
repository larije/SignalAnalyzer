import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAssetCandles, selectedChart, type AssetChartState } from '../assetChart';

afterEach(() => vi.unstubAllGlobals());

const btcCandles = [{ time: 3600000, open: 82000, high: 83000, low: 81000, close: 82500, volume: 12 }];
const goldCandles = [{ time: 3600000, open: 4100, high: 4200, low: 4000, close: 4150, volume: 8 }];
const btcChart: AssetChartState = { asset: 'BTC', timeframe: '1h', candles: btcCandles, loading: false, error: null };

describe('selected asset chart', () => {
  it('shows data only for the current asset and interval', () => {
    expect(selectedChart(btcChart, 'BTC', '1h').candles).toEqual(btcCandles);
    expect(selectedChart(btcChart, 'XAU', '1h')).toEqual({ candles: [], loading: true, error: null });
    expect(selectedChart(btcChart, 'BTC', '4h')).toEqual({ candles: [], loading: true, error: null });
    expect(selectedChart({ ...btcChart, asset: 'XAU', candles: goldCandles }, 'XAU', '1h').candles).toEqual(goldCandles);
  });

  it('does not carry errors or loading messages from the previous selection', () => {
    const failed = { ...btcChart, candles: [], error: 'BTC unavailable' };
    expect(selectedChart(failed, 'BTC', '1h').error).toBe('BTC unavailable');
    expect(selectedChart(failed, 'XAU', '1h').error).toBeNull();
    expect(selectedChart(null, 'XAU', '1h').loading).toBe(true);
    expect(selectedChart(failed, 'XAU', '1m')).toEqual({ candles: [], loading: false, error: null });
  });

  it.each([['BTC', 'BTCUSDT', btcCandles], ['XAU', 'PAXGUSDT', goldCandles]] as const)('fetches only %s candles', async (asset, symbol, candles) => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => candles.map(c => [c.time, String(c.open), String(c.high), String(c.low), String(c.close), String(c.volume)]) });
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    await expect(loadAssetCandles(asset, '1h', 200, controller.signal)).resolves.toEqual(candles);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=1h&limit=200`, { signal: controller.signal, cache: 'no-store' });
  });

  it('rejects malformed chart responses and failed HTTP requests', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ error: 'No candles' }) })
      .mockResolvedValueOnce({ ok: false });
    vi.stubGlobal('fetch', fetch);
    const signal = new AbortController().signal;
    await expect(loadAssetCandles('XAU', '4h', 200, signal)).rejects.toThrow();
    await expect(loadAssetCandles('BTC', '4h', 200, signal)).rejects.toThrow();
  });

  it('propagates cancellation when an asset or timeframe changes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')));
    await expect(loadAssetCandles('BTC', '1h', 200, new AbortController().signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
