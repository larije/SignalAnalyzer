import { NextRequest, NextResponse } from 'next/server';
import { runBacktest } from '@/lib/backtesting';
import type { BacktestPeriod } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_PERIODS  = new Set<BacktestPeriod>(['30d', '90d', '180d', '365d']);
const VALID_SYMBOLS  = new Set(['BTCUSDT', 'PAXGUSDT']);
const VALID_INTERVALS = new Set(['5m', '15m', '1h', '4h']);

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const symbol   = (searchParams.get('symbol')   ?? 'BTCUSDT').toUpperCase();
  const period   = (searchParams.get('period')   ?? '30d') as BacktestPeriod;
  const interval = searchParams.get('interval')  ?? '1h';

  if (!VALID_SYMBOLS.has(symbol))   return NextResponse.json({ error: 'Invalid symbol' },   { status: 400 });
  if (!VALID_PERIODS.has(period))   return NextResponse.json({ error: 'Invalid period' },   { status: 400 });
  if (!VALID_INTERVALS.has(interval)) return NextResponse.json({ error: 'Invalid interval' }, { status: 400 });

  try {
    const result = await runBacktest(symbol, period, interval);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
