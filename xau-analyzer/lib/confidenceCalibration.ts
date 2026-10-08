// Confidence calibration: track how often each confidence band actually wins,
// so we can show an HONEST number instead of an unvalidated heuristic score.
//
// Until we have enough resolved trades, the UI shows a plain label
// (Weak / Medium / Strong) rather than a precise-looking percentage.

export type ConfidenceLabel = 'Weak' | 'Medium' | 'Strong';

/** Plain-language band for a 0-100 confidence score. */
export function confidenceLabel(score: number): ConfidenceLabel {
  if (score >= 70) return 'Strong';
  if (score >= 45) return 'Medium';
  return 'Weak';
}

const BUCKET_WIDTH = 10;          // group confidence into 0-9, 10-19, ...
const MIN_BUCKET_SAMPLES = 10;    // per-bucket resolved trades before a rate is trustworthy
const MIN_TOTAL_FOR_NUMERIC = 30; // total resolved trades before we show any numeric confidence

interface Bucket { wins: number; total: number; }

export class CalibrationStore {
  private buckets = new Map<number, Bucket>();

  private key(score: number): number {
    return Math.floor(Math.max(0, Math.min(100, score)) / BUCKET_WIDTH);
  }

  /** Record a resolved (win/loss) outcome for the given confidence score. */
  add(score: number, win: boolean): void {
    const k = this.key(score);
    const b = this.buckets.get(k) ?? { wins: 0, total: 0 };
    b.total += 1;
    if (win) b.wins += 1;
    this.buckets.set(k, b);
  }

  /** Realized win rate for the score's bucket, or null until it has enough samples. */
  realizedWinRate(score: number): number | null {
    const b = this.buckets.get(this.key(score));
    if (!b || b.total < MIN_BUCKET_SAMPLES) return null;
    return +(b.wins / b.total).toFixed(3);
  }

  /** Total resolved outcomes across all buckets. */
  totalResolved(): number {
    return Array.from(this.buckets.values()).reduce((n, b) => n + b.total, 0);
  }

  /** Serialize for persistence. */
  toJSON(): [number, Bucket][] {
    return Array.from(this.buckets.entries());
  }

  /** Restore from persisted data. */
  loadFrom(entries: [number, Bucket][] | undefined): void {
    if (!entries) return;
    this.buckets = new Map(entries);
  }
}

/** Whether the app has enough resolved trades to show a numeric confidence at all. */
export function showNumericConfidence(store: CalibrationStore): boolean {
  return store.totalResolved() >= MIN_TOTAL_FOR_NUMERIC;
}
