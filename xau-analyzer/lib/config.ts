// Centralised tuning constants that were previously duplicated as bare literals
// across the engine, stores, and multi-timeframe scoring (Q-5). Change a threshold
// here rather than hunting for the same number in several files. Resolution-timing
// constants (RESOLVE_TIMEOUT_MIN, LIVE_COSTS) live in tradeLifecycle.ts, next to
// the code that uses them.

/** Minimum resolved trades before learned adaptive indicator weights are applied. */
export const MIN_ADAPT_SAMPLES = 15;

/** Minimum per-indicator "correct direction" instances before that weight adapts. */
export const MIN_INDICATOR_SAMPLES = 5;

/** STRONG-signal institutional gate. */
export const GATE_MTF_ALIGNMENT = 80; // % of timeframes aligned in the signal's direction
export const GATE_PATTERN_CONF = 75;  // % pattern confidence required (or no pattern at all)

/** Composite-score cut-offs that turn a score into a signal, per engine. */
export const ENHANCED_THRESHOLDS  = { strong: 65, directional: 25 } as const;
export const LEGACY_THRESHOLDS    = { strong: 55, directional: 20 } as const;
export const TIMEFRAME_THRESHOLDS = { strong: 45, directional: 15 } as const;
