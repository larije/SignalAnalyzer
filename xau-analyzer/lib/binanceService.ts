import { EventEmitter } from 'events';
import WebSocket from 'ws';
import type { Candle } from './technicalAnalysis';

export interface TickerData {
  symbol: string;
  price: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  change: number;
  changePercent: number;
  timestamp: number;
}

const MAX_CANDLES = 300;

class BinanceService extends EventEmitter {
  private ws: WebSocket | null = null;
  private candles = new Map<string, Candle[]>();
  private tickers = new Map<string, TickerData>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  public connected = false;

  constructor() {
    super();
    this.setMaxListeners(500);
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const streams = [
      'btcusdt@kline_1m',
      'paxgusdt@kline_1m',
      'btcusdt@miniTicker',
      'paxgusdt@miniTicker',
    ].join('/');

    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;
    console.log('[Binance] Connecting to', url);

    try {
      this.ws = new WebSocket(url);
    } catch (e) {
      console.error('[Binance] Failed to create WebSocket:', e);
      this.reconnectTimer = setTimeout(() => this.connect(), 5000);
      return;
    }

    this.ws.on('open', () => {
      this.connected = true;
      console.log('[Binance] WebSocket connected');
      this.emit('connected');
      this.pingTimer = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.ping();
      }, 20_000);
    });

    this.ws.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString()) as { stream: string; data: Record<string, unknown> };
        this.handleMessage(msg);
      } catch { /* ignore parse errors */ }
    });

    this.ws.on('close', () => {
      this.connected = false;
      if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
      console.log('[Binance] Disconnected — reconnecting in 5s');
      this.reconnectTimer = setTimeout(() => this.connect(), 5_000);
    });

    this.ws.on('error', (err: Error) => {
      console.error('[Binance] WS error:', err.message);
    });

    this.loadHistory('BTCUSDT');
    this.loadHistory('PAXGUSDT');
  }

  private handleMessage(msg: { stream: string; data: Record<string, unknown> }) {
    const { stream, data } = msg;
    if (stream.includes('@kline'))      this.handleKline(data);
    else if (stream.includes('@miniTicker')) this.handleTicker(data);
  }

  private handleKline(data: Record<string, unknown>) {
    const k = data.k as Record<string, unknown>;
    const symbol = (data.s as string).toUpperCase();
    const candle: Candle = {
      time:   k.t as number,
      open:   parseFloat(k.o as string),
      high:   parseFloat(k.h as string),
      low:    parseFloat(k.l as string),
      close:  parseFloat(k.c as string),
      volume: parseFloat(k.v as string),
    };

    if (!this.candles.has(symbol)) this.candles.set(symbol, []);
    const arr = this.candles.get(symbol)!;
    const last = arr[arr.length - 1];
    if (last?.time === candle.time) arr[arr.length - 1] = candle;
    else {
      arr.push(candle);
      if (arr.length > MAX_CANDLES) arr.shift();
    }

    this.emit('candle', { symbol, candle, closed: k.x as boolean });
  }

  private handleTicker(data: Record<string, unknown>) {
    const symbol = (data.s as string).toUpperCase();
    const price  = parseFloat(data.c as string);
    const open   = parseFloat(data.o as string);
    const ticker: TickerData = {
      symbol,
      price,
      open,
      high:          parseFloat(data.h as string),
      low:           parseFloat(data.l as string),
      volume:        parseFloat(data.v as string),
      change:        price - open,
      changePercent: ((price - open) / open) * 100,
      timestamp:     Date.now(),
    };
    this.tickers.set(symbol, ticker);
    this.emit('ticker', { symbol, ticker });
  }

  private async loadHistory(symbol: string) {
    const hosts = [
      'api.binance.com',
      'api1.binance.com',
      'api2.binance.com',
      'api3.binance.com',
      'data-api.binance.vision',
    ];

    for (const host of hosts) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(
          `https://${host}/api/v3/klines?symbol=${symbol}&interval=1m&limit=200`,
          { signal: controller.signal }
        );
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as string[][];
        const candles: Candle[] = data.map(k => ({
          time:   parseInt(k[0]),
          open:   parseFloat(k[1]),
          high:   parseFloat(k[2]),
          low:    parseFloat(k[3]),
          close:  parseFloat(k[4]),
          volume: parseFloat(k[5]),
        }));
        this.candles.set(symbol, candles);
        console.log(`[Binance] Loaded ${candles.length} candles for ${symbol} via ${host}`);
        this.emit('history', { symbol, candles: candles.slice(-100) });
        return;
      } catch (e) {
        console.warn(`[Binance] History failed via ${host} for ${symbol}:`, (e as Error).message);
      }
    }
    console.error(`[Binance] All history endpoints failed for ${symbol} — will rely on live stream`);
  }

  getCandles(symbol: string): Candle[]      { return this.candles.get(symbol.toUpperCase()) ?? []; }
  getTicker(symbol: string): TickerData | null { return this.tickers.get(symbol.toUpperCase()) ?? null; }
}

// Singleton — survives hot-reload in Next.js dev mode
declare global {
  // eslint-disable-next-line no-var
  var _binanceSvc: BinanceService | undefined;
}

function getInstance() {
  if (!global._binanceSvc) {
    global._binanceSvc = new BinanceService();
    global._binanceSvc.connect();
  }
  return global._binanceSvc;
}

export const binanceService = getInstance();
