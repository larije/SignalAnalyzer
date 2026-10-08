// Single source of computed signals for the whole process.
//
// Previously EVERY SSE connection (and every /api/signals poll) called
// computeSignalForAsset independently, so N clients meant N identical
// computations and 4N Binance REST fetches per candle, and trades only resolved
// while someone was watching (PERF-1, BUG-2 timing). This driver subscribes ONCE
// to the candle feed, computes each asset's signal a single time per closed
// candle (which also resolves + records), caches the result, and fans it out to
// all subscribers. Routes read the cache instead of recomputing.
import { EventEmitter } from 'events';
import { binanceService } from './binanceService';
import { computeSignalForAsset, type LiveSignalResult } from './liveSignal';

type Asset = 'BTC' | 'XAU';

const SYMBOL_TO_ASSET: Record<string, Asset> = {
  BTCUSDT: 'BTC',
  PAXGUSDT: 'XAU',
};

type ComputeFn = (asset: Asset) => Promise<LiveSignalResult | null>;

export class SignalDriver extends EventEmitter {
  private latest = new Map<Asset, LiveSignalResult>();
  private inflight = new Map<Asset, Promise<LiveSignalResult | null>>();
  private started = false;

  /** @param compute injectable for tests; defaults to the real pipeline. */
  constructor(private readonly compute: ComputeFn = computeSignalForAsset) {
    super();
    this.setMaxListeners(0); // one listener per SSE connection; no artificial cap
  }

  /** The most recent computed signal for an asset, or null before the first compute. */
  getLatest(asset: Asset): LiveSignalResult | null {
    return this.latest.get(asset) ?? null;
  }

  /**
   * Compute (and resolve/record) one asset's signal, coalescing concurrent calls
   * so only one computation runs per asset at a time. Caches and emits on success.
   */
  refresh(asset: Asset): Promise<LiveSignalResult | null> {
    const existing = this.inflight.get(asset);
    if (existing) return existing;

    const p = this.compute(asset)
      .then(result => {
        if (result) {
          this.latest.set(asset, result);
          this.emit('signal', result);
        }
        return result;
      })
      .catch(() => null)
      .finally(() => { this.inflight.delete(asset); });

    this.inflight.set(asset, p);
    return p;
  }

  /** Subscribe to the candle feed and compute on every close. Idempotent. */
  start(): void {
    if (this.started) return;
    this.started = true;

    binanceService.on('candle', (p: { symbol: string; closed: boolean }) => {
      if (!p.closed) return;
      const asset = SYMBOL_TO_ASSET[p.symbol.toUpperCase()];
      if (asset) void this.refresh(asset);
    });

    // Prime both assets immediately (don't wait a full minute for the first close).
    void this.refresh('BTC');
    void this.refresh('XAU');
  }
}

// ── Singleton across Next.js requests (mirrors binanceService) ────────────────
declare global {
  // eslint-disable-next-line no-var
  var _signalDriver: SignalDriver | undefined;
}

function getInstance(): SignalDriver {
  if (!global._signalDriver) {
    global._signalDriver = new SignalDriver();
    // Don't open network work during tests or the production build's data-collection
    // phase; only run the live driver in a real server process.
    if (process.env.NODE_ENV !== 'test' && process.env.NEXT_PHASE !== 'phase-production-build') {
      global._signalDriver.start();
    }
  }
  return global._signalDriver;
}

export const signalDriver = getInstance();
