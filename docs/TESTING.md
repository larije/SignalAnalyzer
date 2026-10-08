# Testing

Audit-era snapshot, 15 September 2026. Code citations are relative to the `xau-analyzer/`
app folder. Finding IDs (TEST-1, ST-2, BUG-*, …) are canonical — see TECHNICAL_DEBT.md for
the full register and roadmap phases.

## How to run

| Command | What it does |
|---|---|
| `npm test` | `vitest run` — single pass, all tests |
| `npm run test:watch` | `vitest` — watch mode |
| `npx tsc --noEmit` | Type check (strict mode; `tsconfig.json:6`) |
| `npm run build` | Next.js production build (includes its own lint/type pass) |

There is no `lint` script, no coverage configuration, no setup file, and no CI — tests run
locally only. The Vitest config is eight lines (`vitest.config.ts`): `node` environment,
`include: ['lib/**/*.test.ts']`. That include pattern is worth noting: **only `lib/` is ever
tested**. All five API route handlers under `app/api/` and the whole of `app/page.tsx`
(1,659 lines, the entire UI) are outside the test glob by construction.

## Current results (snapshot at audit date)

| Check | Result |
|---|---|
| `npx vitest run` (v2.1.9) | 15 files, **51/51 pass**, 0 failures, ~925 ms |
| `npx tsc --noEmit` | Clean, zero errors |
| `npm run build` (Next 14.2.3) | Success; 5/5 pages; 207 kB first-load JS |

Green across the board — but see "Test hygiene" below: both the test run and the build open
real network connections to Binance, so neither is hermetic.

## Test inventory

All test files live in `lib/__tests__/`. Quality assessment is from the audit's read of
each file, not from coverage tooling (none is configured).

| File | Tests | What it verifies | Assessment |
|---|---|---|---|
| `backtestEngine.test.ts` | 6 | `evalBarExit`: WIN, LOSS, **pessimistic both-touch bar = LOSS with exit at the stop**, still-open null, short WIN, exact cost arithmetic (4% gross − 0.4% costs = 3.6%) | Strong — real maths, real semantics |
| `backtesting.test.ts` | 3 | `simulate()`: entry-bar/exit-next-bar off-by-one, TIMEOUT never counted as WIN and excluded from win rate, invariant `wins+losses+timeouts === totalTrades` | Strong — via injected `SignalFn` on synthetic candles |
| `signalHistory.test.ts` | 7 | The core honesty guarantees: WIN only on take-profit, LOSS on stop, tiny positive drift after 60 min = TIMEOUT, win rate excludes timeouts, all three dedup paths (no double-record while PENDING; re-record on flip/resolve) | Strong — pins the app's central promise |
| `patternDatabase.test.ts` | 2 | `sampleSize` counts only decided trades (3W/1L/1T → win rate 0.75), neutral 0.5 on empty | Real |
| `persistence.test.ts` | 1 | Cross-instance disk round-trip of `SignalHistoryStore` through `.data/`, including calibration restore | Strong — genuine integration test |
| `calibration.test.ts` | 4 | Weak/Medium/Strong bands, 30-resolved gate for numeric confidence, 10-per-bucket gate, realised bucket win rate | Real thresholds |
| `stats.test.ts` | 6 | `computeAvgRR` (1.5, zero-when-no-losses, finite), `perTradeSharpe` (mean/std, no annualisation, zero-variance = 0) | Real |
| `correlation.test.ts` | 3 | `pearsonReturns` ≈ 1 / ≈ −1 / 0 below 10 points | Real |
| `storage.test.ts` | 2 | `saveJson`/`flushNow`/`loadJson` round-trip; fallback on missing file | Real, but see gaps: debounce itself untested |
| `newsRisk.test.ts` | 3 | Deterministic LOW + `isEstimate`, weekend flag, NFP DST tolerance | Real |
| `liveSignal.test.ts` | 5 | Non-repainting helpers only: `lastClosedCandle` = second-to-last, null below 2, `closedCandles` drops the forming bar, `isStale` 90 s boundary | Real but narrow — does **not** test `computeSignalForAsset` |
| `session.test.ts` | 3 | Session classification at fixed UTC hours | Real but shallow |
| `coverage.test.ts` | 3 | Volume spike ratio > 2 → STRONG_BULL, low volume → non-positive; market structure **bounds only** (score ∈ [−20, 20], strength ∈ [0, 100], one negative assertion) | Half real, half sanity-bounds — the structure block would pass for many broken implementations |
| `indicators.test.ts` | 2 | `ema200` null below 200 candles, number at ≥ 200 | Shallow — the only indicator test; no RSI/MACD/BB/ATR/Stoch maths anywhere |
| `smoke.test.ts` | 1 | `1 + 1` | Padding |

**Overall:** the suite is mostly behaviour-verifying, not padding. Its three genuine
strengths are the backtest engine's pessimistic both-touch proof (outcome *and* exit price
asserted), the signal-history honesty semantics (TIMEOUT ≠ WIN, the dedup paths), and the
real persistence round-trip. No test was found to mask a known bug — expectations match the
implementations as read. The weakness is *placement*: everything tested is periphery or
plumbing; the scoring engine users actually trade on has zero direct tests (see TEST-1).

## Test hygiene: network in unit tests (ST-2)

`binanceService.ts:182-190` constructs a singleton and calls `connect()` **at module import
time**. Consequences, empirically verified during the audit run:

- `liveSignal.test.ts` imports `lib/liveSignal.ts`, which imports `binanceService` — so
  **`npm test` opens a real WebSocket to `wss://stream.binance.com:9443`** and fires REST
  kline fetches. Currently harmless (tests pass), but it is a flakiness and offline-CI
  hazard, and makes `binanceService` untestable in isolation.
- `next build` does the same twice during "Collecting page data" (the API route modules
  import the singleton). The build is not hermetic; offline behaviour is unverified.
- `storage.test.ts` and `persistence.test.ts` write real files into `.data/` — the **same
  cwd-relative directory the running app persists its learning stores to**
  (`storage.ts:6`). Tests clean up after themselves, but tests and the live app share a
  data directory, which is fragile if a test ever writes `signalHistory.json` or
  `patternDatabase.json` under their production names while the dev server is running.

The canonical fix (ST-2, Phase 1) is lazy connection: export a getter, connect on first
real use, and let tests inject candles without touching the network.

## Coverage-gap register (TEST-1)

TEST-1 is the canonical finding for these gaps. Priorities below follow the roadmap:
Phase 1 explicitly includes "TEST-1 core additions (signalEngine, riskManagement,
resolution edges)". Where a confirmed bug lives in an untested module, it is cited — the
pattern is stark: **every confirmed signal-maths bug (BUG-1, BUG-3, BUG-4) sits in code
with zero tests.**

| Pri | Module | Untested behaviour | Why it matters | Suggested test |
|---|---|---|---|---|
| 1 | `signalEngine.ts` (330 lines) | Everything: score thresholds (`:229-233`), the 6-condition STRONG gate and downgrade (`:241-279`), NO_TRADE on EXTREME news risk (`:282-285`), adaptive weights gated on `sampleSize >= 15` (`:200-208`), legacy `generateSignal` (`:72-76`). Backtest tests bypass it via an injected stub `SignalFn`. | This is the decision core. BUG-1 (MACD crossover tautology) and BUG-4 (asymmetric STRONG gate) live here undetected — a threshold test on crafted indicator inputs would have caught both. | Feed hand-built `Indicators`/MTF/structure fixtures; assert signal class at score boundaries (±25, ±65), each gate condition failing individually, and the NO_TRADE override. |
| 2 | `riskManagement.ts:5-105` | `calculateRiskMetrics` — the actual stop/target computation frozen into live signals: ATR/structure blend and tighter-of clamps (`:30`, `:36`, `:41`, `:46`). Backtest tests use hand-written stops. | These numbers are what a user would place orders at; they have never been numerically verified. BUG-12 (hard-coded `winProb` EV) also lives here. | Numeric cases: swing-low present vs absent, clamp floor (`atr*0.8`) and ceiling (`atrStop*1.5`) actually binding, bull/bear symmetry, R:R arithmetic. |
| 3 | `signalHistory.ts:94-125`, `patternDatabase.ts:148-171` | `resolvePending` edges: age exactly 60 min, price gapping far beyond the stop, TIMEOUT with negative drift; and the structural limit that live resolution samples only the closed-candle **close**, so intrabar stop/TP touches are missed (unlike `backtestEngine.ts:43`). | This is the substance of BUG-2 — live results optimistic vs the backtester. Edge tests both document current behaviour and become regression tests for the Phase 1 fix. | Boundary-age and gap-past-stop cases now; a shared bar-based `evalBarExit` test once BUG-2 is fixed. |
| 4 | `liveSignal.ts:66-139` | `computeSignalForAsset`, the central orchestrator (called by the SSE route and `/api/signals`): resolve-before-record ordering (`:102-103`), record-only-actionable gate + tradeId construction (`:122-126`), stale-flag wiring (`:131`), MTF fetch-failure fallback (`:87-91`). Only its three trivial helpers are tested. | BUG-6 (stale data still recorded into learning stores, `:122`) lives on exactly the untested path. | After ST-2's lazy connect: inject candles, assert record/skip decisions and ordering. |
| 5 | `binanceService.ts` | Entirely untested: reconnect-on-close timer (`:69-74`), kline replace-vs-append + `MAX_CANDLES` trim (`:102-109`), miniTicker parsing (`:114-131`), multi-host history fallback (`:142-170`). | Sole market-data source; currently *untestable* because of the import-time connect (ST-2). | Fix ST-2 first, then unit-test parsing/trim against recorded frames. |
| 6 | `multiTimeframe.ts`, `backtesting.ts:68-82` | `mtfFromTimeframes` aggregation (`:126-170`: alignment, dominant-bias ±2 rule, −25..+25 score) and `scoreTimeframe` (`:36-92`); `resample()` OHLCV grouping. | MTF feeds ±25 of the score and the STRONG gate; BUG-8 (forming higher-TF bars) sits here. `resample` underpins every backtest bar. | Aggregation on fixed per-TF bias fixtures; resample on a known 1m series with a ragged tail. |
| 7 | `technicalAnalysis.ts` | No numeric correctness tests for `calcEMA`/`calcRSI`/MACD/BB/ATR/Stoch — only ema200 nullability is covered. | All scoring rests on these; BUG-16 (EMA seeding, ATR variant) shows the maths has undocumented quirks. | Known-answer tests against hand-computed short series (and pin the current EMA seed/ATR variant as documented behaviour). |
| 8 | `storage.ts:40-51` | The 500 ms debounce itself (no fake-timer test that repeated saves coalesce, that an unflushed write lands, that bare `flushNow()` flushes all); corrupt-file fallback (`:16-22`, only missing-file tested). | ST-1's fix (atomic write, shutdown flush) needs these as its regression harness. | `vi.useFakeTimers()` coalescing test; write malformed JSON, assert fallback. |
| 9 | `app/api/stream/route.ts` | SSE route: listener registration/cleanup on abort (`:61-91` — a listener leak would be invisible), per-asset `signalCandleTime` dedup (`:34-44`), 15 s heartbeat (`:67-77`). | Outside the vitest include glob entirely; PERF-1 and ST-3/ST-4 changes will land here blind. | Route-handler test with a mock `ReadableStream` controller and an `AbortController`. |
| 10 | Whole modules with zero tests | `patternRecognition.ts` (310 lines), `smartMoney.ts` (169), `marketRegime.ts` (167, incl. `applyRegimeMultiplier` used at `signalEngine.ts:221`), `volatilityRegime.ts`, `volumeProfile.ts`, `confidenceModel.ts` (115), `patternDatabase.getAdaptiveWeights`, `monteCarlo.ts` (dead — Q-7) | `confidenceModel` carries BUG-3 (direction-blind MTF bonus — a single SELL-with-bearish-MTF assertion would have caught it). `monteCarlo` should be deleted (Q-7), not tested. | One direction-symmetry test per scorer is the highest-value cheap addition; write BUG-3's fix test first. |
| 11 | `app/page.tsx` + remaining API routes | 1,659 lines of UI incl. SSE client reconnect logic; `candles`, `signals`, `backtest`, `performance` routes. | Outside the test glob; realistically deferred until the Q-2 component split makes pieces testable. | Extract-then-test as part of Phase 2; do not attempt to test the monolith. |

Historical note: the original trust-improvements plan promised indicator tests for
RSI/EMA/MACD/BB/ATR/Stoch and riskManagement tests (design Phase 6 / plan Task 6.2). Only
the ema200 nullability test shipped; riskManagement got none. TEST-1 is partly that
undelivered commitment.

## Recommended testing strategy

In order, matching the canonical roadmap (Phases 0-1):

1. **Break the network dependency first (ST-2).** Make `binanceService` connect lazily and
   injectable. Until then, every test that transitively imports it is a networked test,
   and `binanceService` itself cannot be tested at all. Cheap, unblocks everything below.
2. **signalEngine threshold and gate tests.** Fixture-driven: assert the BUY/SELL/HOLD
   boundaries, each STRONG-gate condition in isolation, the downgrade path, and NO_TRADE.
   Write the BUG-1/BUG-3/BUG-4 regression tests *with* their fixes (Phase 0 pairs each fix
   with a test) — bull/bear symmetry assertions are the pattern that catches this whole
   class of bug.
3. **riskManagement numeric tests.** Hand-computed stop/target cases proving each clamp
   binds. These freeze the levels users trade on.
4. **Resolution edge cases.** Boundary-age, gap-past-stop, and negative-drift TIMEOUT tests
   on `resolvePending`; they double as the specification for the BUG-2 shared bar-based
   resolution work.
5. **One end-to-end `defaultSignalFn` backtest assertion.** The existing backtest tests
   only exercise injected stub signals — the real pipeline (signalEngine + riskManagement
   stops/targets) has no end-to-end assertion anywhere. A single deterministic-candle run
   through `defaultSignalFn` asserting trade count, levels, and the totals invariant would
   close that gap and pin live/backtest engine parity (the honesty claim BUG-9 shows is
   currently overstated).

Afterwards: indicator known-answer tests, storage fake-timer tests, and the SSE route
harness, roughly in that order of value. Adding vitest coverage reporting (`--coverage`)
once the above lands would make regressions in the untested half visible; configuring it
today would merely quantify what this register already states.
