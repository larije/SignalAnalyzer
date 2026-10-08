import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

const VALID_INTERVALS = new Set(['1m','3m','5m','15m','30m','1h','2h','4h','6h','12h','1d','1w']);

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const symbol   = (searchParams.get('symbol')   ?? 'BTCUSDT').toUpperCase();
  const interval = searchParams.get('interval')  ?? '1m';
  const limit    = Math.min(200, Math.max(10, parseInt(searchParams.get('limit') ?? '100')));

  if (!VALID_INTERVALS.has(interval)) {
    return new Response('Invalid interval', { status: 400 });
  }

  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return new Response('Binance error', { status: 502 });

    const raw = await res.json() as [number, string, string, string, string, string][];
    const candles = raw.map(k => ({
      time:   k[0],
      open:   parseFloat(k[1]),
      high:   parseFloat(k[2]),
      low:    parseFloat(k[3]),
      close:  parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));

    return Response.json(candles, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return new Response('Failed to fetch candles', { status: 500 });
  }
}
