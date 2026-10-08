# Changelog

> Reconstructed from git history during the 2026-09-15 system audit. The project had no
> changelog before that date; this file should be maintained going forward. Format loosely
> follows [Keep a Changelog](https://keepachangelog.com/) — newest first. No version tags
> exist, so entries are grouped by delivery date and theme. Audit finding IDs (SEC-n, BUG-n,
> Q-n…) refer to TECHNICAL_DEBT.md / IMPROVEMENT_ROADMAP.md.

## Unreleased — Phase 2/3 UX (in progress) (branch `phase-0-stabilization`, 2026-09-15)

- **UX-2** — Removed the fabricated minute-precision timing widget (`ACTIVE WINDOW`/`NEXT CHANGE`
  invented from RSI × constants, score-based "freshness" that repainted intrabar). Replaced
  `computeSignalTiming` with a lean `computeLateEntry` that keeps only the defensible late-entry
  caution.
- **UX-1 / Q-1** — Consolidated the three competing verdict surfaces. The per-asset SignalCard now
  renders the **enhanced** verdict and reasons (same engine as TradeCallCard) so they can never
  contradict, and the top bar is a plain price ticker (dropped its separate signal label +
  confidence). Verified in-browser.
- **A11Y-5 (responsive, partial)** — Converted the hard-coded `1fr 1fr` / `repeat(4,1fr)` /
  `1fr 280px` grids to `auto-fit minmax(...)` so they stack on narrow screens; made the sticky
  top/tab bars (and their inner groups) wrap and drop `position:sticky` under 720px; added
  `min-width:0` to Card so ResponsiveContainer charts don't force overflow; hid the decorative
  top-bar subtitle on phones; added a `body{overflow-x:hidden}` guard. Verified at 1440px (no
  desktop regression) and 390px (cards stack, bars wrap) via headless screenshots. **Known
  residual:** a small right-edge clip from a nowrap element remains at ~390px, needing live
  DevTools to pinpoint — tracked as follow-up.
- **Bug fix** — The SignalCard score badge rendered the raw float score (e.g. `-12.979999999999`);
  now rounded. This also relieved part of the mobile overflow.

## Unreleased — Phase 2 (in progress) (branch `phase-0-stabilization`, 2026-09-15)

- **Design system (typography + a11y foundation)** — Loaded **JetBrains Mono** (declared in the
  `F.mono` token but never loaded or used) and routed all 117 `fontFamily: "monospace"` literals
  to it, so numerals/prices render in the intended font instead of the Courier fallback. Added
  readable `redText`/`blueText` tokens for the red/blue text-on-tint pills that failed AA at small
  sizes (A11Y-4), applied via the shared `Pill` component. Added a `prefers-reduced-motion` guard
  that neutralises the infinite pulse animations and hover transforms. Verified in-browser
  (headless screenshots) — no layout regressions.
- **Q-7** — Removed dead code: `lib/monteCarlo.ts` and its `MonteCarloResult`/`MonteCarloPoint`
  types (zero importers), the unused `confidenceColor`/`confidenceLabel` in `confidenceModel.ts`,
  `newsRiskColor` in `newsRisk.ts`, and the unrendered `PageSection` component plus the
  never-read `SignalTiming.actionBg` field in `page.tsx`. No behaviour change; 91 tests green.

## Unreleased — Phase 1 architecture (branch `phase-0-stabilization`, 2026-09-15)

Compute-once signal driver. `tsc` clean, `next build` green, suite 86 → 91, and verified with a
live dev-server smoke test (`/api/signals` returns cached signals; SSE emits `init` + fanned-out
`signal` events with no per-connection recompute).

- **PERF-1 + BUG-2 (timing half)** — Added `lib/signalDriver.ts`, a process-wide singleton that
  subscribes ONCE to the candle feed, computes each asset's signal a single time per closed
  candle (which also resolves + records), caches it, and fans it out. `/api/stream` now
  subscribes to the driver instead of computing per connection; `/api/signals` is read-only
  (returns the cache, computing only on a cold start) and no longer mutates the learning stores
  on every poll. Trades now resolve on every candle close even with no client watching, and the
  per-connection signal dedup is monotonic (also closes ST-4's regression window).
- **Q-5** — Added `lib/config.ts` centralising the tuning constants that were duplicated as bare
  literals across the engine, stores, and multi-timeframe scoring (adaptive-weight sample
  minimums, the STRONG-gate 80/75 thresholds, and the per-engine score cut-offs). Pure refactor,
  values unchanged.

## Unreleased — Phase 0 stabilisation (branch `phase-0-stabilization`, 2026-09-15)

First remediation pass after the system audit. Every logic fix landed test-first (RED → GREEN);
the suite grew from 51 to 70 tests. `tsc --noEmit` clean and `next build` green throughout.

Phase 1 correctness fixes (BUG-2/6/7/8/9, Q-4) shipped in commit `58a2e53`: live trade
resolution made bar-aware and cost-charged via a shared `lib/tradeLifecycle.ts` (matching the
backtester), stale data no longer recorded, ML probability filtered by asset, higher-timeframe
scoring uses closed candles only, and the backtest hold window aligned to the live 60-min timeout.

### Security
- **SEC-1** — Upgraded Next.js `14.2.3 → 15.5.25`, closing the unauthenticated Windows-host RCE
  (GHSA-p293-qw3h-jr36, affected `<15.5.24`) and all direct DoS / SSRF / cache-poisoning
  advisories. `14.2.35` was tried first but is still inside the RCE range, so the major bump was
  required. Migrated `next.config.mjs` (`experimental.serverComponentsExternalPackages` →
  `serverExternalPackages`). Residual audit items are build-time only (bundled postcss, needs
  Next 16) and dev-only (vitest/vite/esbuild, SEC-3).

### Signal correctness (bug fixes)
- **BUG-1** — MACD "crossover" was a tautology (`histogram > 0 && value > signal` ≡ `histogram > 0`),
  so MACD scored the full ±25 and printed "crossover" on every bar it was above/below signal.
  Added `prevHistogram` to the indicators and a shared `macdCross` / `scoreMacd` helper that
  detects a real sign flip; fixed in `generateSignal`, `generateEnhancedSignal`, and
  `multiTimeframe` scoring.
- **BUG-3** — Confidence model's MTF bonus was direction-blind (credited the bullish share to
  shorts too, inverting every short's confidence); the MACD "agreement" bonus fired for any
  non-zero histogram. Both are now measured in the signal's own direction.
- **BUG-4** — The STRONG-signal gate and trend-regime strength counted HOLD timeframes as bearish
  confirmation for shorts (`100 - alignment`). Added `mtfAlignmentFor`, which uses the real
  bearish share; applied in `signalEngine` and `marketRegime`.
- **BUG-5** — Candle `time` (the Binance kline OPEN time) was treated as the close time, so
  healthy live data showed "STALE — DO NOT TRADE" for part of every minute and the "Signal as of"
  label was a minute early. Staleness and the reported candle time now use the close time
  (`open + 60s`) via `closeTimeOf`.

### Reliability
- **ST-1** — Persistence hardened: atomic writes (temp file + rename), corrupt JSON preserved to
  a `.corrupt` sidecar instead of being silently overwritten, write failures logged instead of
  swallowed, and a shutdown flush (`beforeExit` / `SIGINT` / `SIGTERM`) so the last debounced
  write is not lost on exit.

### UI / accessibility
- **UX-10** — Removed the `#{tick}` render-counter from the top bar (and the effect that forced a
  second render per tick), renamed the "ADAPTIVE WEIGHTS · PHASE 22" panel to "ADAPTIVE WEIGHTS",
  updated stale page metadata (no longer "powered by AI"; now BTC-and-gold accurate), and aligned
  the `<body>` background to the app background.
- **A11Y-1** — Replaced the global `button { outline: none }` (which erased all keyboard focus
  visibility) with a `:focus-visible` ring.

## 2026-08-13 — Trust-improvements release (`56d7a4e`, merge of `trust-improvements`)

A single-day effort (spec → plan → implementation → tests → merge) to make the signal app
trustworthy, real-time, and honest. Delivered in the themed phases below, listed newest first.

### Merge and test coverage (`56d7a4e`, `174c062`)
- Merged the `trust-improvements` branch into `main`.
- Added tests for volume and market-structure maths; suite green (51/51 at audit time).
- Added `README-signals.md`, a plain-language explanation of how signals work.
- *Audit note:* engine thresholds, risk maths, and API routes remain untested (TEST-1), and
  unit tests open a real Binance websocket via import side effect (ST-2).

### Honest probability labels and de-jargon (`ff1f16b`)
- Rewrote the signal card in plain English; replaced trader jargon across the UI.
- Numeric confidence hidden until enough real outcomes exist; honest Weak/Medium/Strong labels.
- *Audit note:* the disclosure rule is applied inconsistently — three other surfaces still leak
  raw confidence numbers (UX-4), and calibration outputs are never surfaced in the UI (Q-6).

### AI-analysis removal — fully free app (`939cbf8`)
- Removed the Claude AI analysis feature entirely; the app now needs no API keys and is free
  to run. All signals come from local deterministic computation.
- *Audit note:* layout metadata still says "powered by AI" (UX-10).

### Real-time non-repainting signals (`03ccf40`)
- Signals now fire once per CLOSED 1m candle with frozen entry/stop/target — they never
  repaint after the fact. Delivered to the browser over SSE.
- *Audit note:* the "timing" widget still repaints intrabar (UX-2), stale detection misreads
  kline open time as close time (BUG-5), and signal compute is duplicated per SSE client (PERF-1).

### Cost-aware backtester on the shared engine (`337abaa`, `ab25795`, `7b965a9`)
- Backtest trade simulator with 0.15% costs and a pessimistic same-bar stop/target rule.
- Backtest reuses the enhanced signal engine rather than a separate approximation.
- Session analysis refactored to accept an explicit timestamp (testability).
- *Audit note:* "runs the SAME engine" overstates — live and backtest diverge in four
  undisclosed ways (BUG-9), and live outcome resolution is more optimistic than the
  backtester's (BUG-2).

### Persistence of learning state (`12515ab`, `e0b5f31`)
- Local JSON storage helper with debounced writes to `.data/` (no database, no accounts).
- Signal history, pattern database, and calibration store now survive restarts.
- *Audit note:* writes are non-atomic with no shutdown flush; a crash mid-write can silently
  lose the learning database (ST-1).

### Honest outcome tracking and learning (`2ae25b5`, `503070e`, `8cee771`, `5d1f529`)
- Honest win definition with a separate TIMEOUT bucket — timeouts are never counted as wins.
- One record per open setup, stopping autocorrelated duplicate trades.
- Pattern DB reports the real matched-sample count instead of an inflated one.
- Confidence calibration store added, backing the Weak/Medium/Strong labels.
- *Audit note:* ML probability still pools BTC and PAXG history (BUG-7), and stale-data
  signals are still recorded into the learning stores (BUG-6).

### Correctness fixes and test harness (`c7f087c`, `3c3eaef`, `22ad5ec`, `00f76e8`, `aa4a884`)
- Added the vitest test harness.
- Fixed avgRR divide-by-zero and a bogus 252-day-annualised Sharpe ratio.
- Correlation computed on log returns instead of raw price levels.
- EMA200 exposed only when genuinely computable (null otherwise).
- News risk made timestamp-driven and labelled an estimate.
- *Audit note:* news-risk calendar windows are still misaligned (BUG-14); correlation still
  pairs series by array index rather than timestamp (BUG-10).

### Specification and plan (`97c1dd3`, `c95a5f0`, `00349bf`)
- Design spec for trust and simplicity improvements, extended with real-time non-repainting
  delivery, plus a step-by-step implementation plan.
- *Audit note:* the plan's promised `page.tsx` component split was never delivered — the page
  remains a 1,659-line monolith (Q-2).

## 2026-06-16 to 2026-06-19 — Initial build (`c383959`, `02fb5e3`, `1232be0`)

- Initial commit of the XAU/BTC signal analyzer (Next.js 14 App Router, React 18, TypeScript,
  Recharts, `ws`): Binance websocket feed, indicator suite, five-tab dashboard.
- Two unlabelled follow-ups ("update1", "update3") — pre-changelog era, contents not itemised.

## Unreleased / planned

Nothing merged since 2026-08-13. Next work is defined by IMPROVEMENT_ROADMAP.md, starting
with **Phase 0 — Stabilization**: the Next.js security upgrade (SEC-1, the only critical
finding), the signal-maths fixes (BUG-1, BUG-3, BUG-4), stale-clock fix (BUG-5), atomic
persistence (ST-1), dev-artifact cleanup (UX-10), and focus visibility (A11Y-1) — each with a
regression test where applicable.
