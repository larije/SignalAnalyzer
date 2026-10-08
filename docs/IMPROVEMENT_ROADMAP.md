# Improvement Roadmap

Audit-era snapshot, 15 September 2026. Finding IDs, severities, and phases are canonical to
the system audit — see KNOWN_ISSUES.md / TECHNICAL_DEBT.md for full finding detail and
ARCHITECTURE.md for how the pieces fit. Paths are relative to the `xau-analyzer/` app folder.

Baseline at time of writing: `vitest run` 51/51 pass, `tsc --noEmit` clean, `next build`
succeeds (207 kB first-load JS). The roadmap below improves a working system; nothing here is
a rescue.

## Principles

1. **Understand before changing.** Every fix starts from the verified finding, not the
   symptom. Read the module, confirm the behaviour, then change it.
2. **Improve incrementally.** Small, reviewable steps that keep the suite green at every
   commit. Rewrite only where there is a clear, stated reason (e.g. Q-4's twin stores, where
   piecemeal patching would have to be done twice).
3. **Every change ships verified.** The project's implementation rule: each change lands with
   (a) tests — a regression test for bug fixes, behaviour tests for features; (b) a clean
   `tsc --noEmit`; (c) lint — note the app currently has no ESLint config, so adding
   `next lint` is an early quick win; (d) manual verification in the running app. No claim of
   "fixed" without observed evidence.
4. **Honesty over polish.** This app's core promise is honest signals. Fixes that affect the
   win rate, calibration, or learning stores (BUG-1/2/3, BUG-6/7) take precedence over
   anything cosmetic.

## Phased roadmap

### Phase 0 — Stabilization (days)

**Goal:** remove the one critical security exposure and the signal-math defects that make
every displayed score wrong, plus the cheapest trust-visible fixes.

| ID | Task | Effort |
|---|---|---|
| SEC-1 | Upgrade Next.js: `next@14.2.35` now, plan 15.5.24+ (Windows RCE, GHSA-p293-qw3h-jr36) | Small |
| BUG-1 | Fix MACD "crossover" tautology (always contributes full ±25; dead momentum branches) | Medium |
| BUG-3 | Fix direction-blind MTF confidence bonus (every short's confidence inverted) | Small |
| BUG-4 | Fix asymmetric STRONG-gate MTF check (HOLD timeframes counted as bearish) | Small |
| BUG-5 | Fix kline open-time treated as close-time (false STALE banner ~half of first loads) | Small |
| ST-1 | Atomic persistence (tmp+rename), flush on shutdown, log write errors | Small |
| UX-10 | Remove dev artifacts: `#{tick}` counter, "PHASE 22" title, stale "powered by AI" metadata | Small |
| A11Y-1 | Restore focus visibility (`:focus-visible` replacing global `outline:none`) | Small |

**Exit criteria:** `npm audit` shows no critical advisory for `next`; regression tests exist
for BUG-1/3/4 (MACD cross detection, short-side confidence, gate symmetry); no false STALE
banner during the last 30 s of a minute; suite, `tsc`, and build green.

### Phase 1 — Trust & data foundation (1–2 weeks)

**Goal:** make the recorded outcomes — the numbers the app's honesty rests on — actually
true, and stop the server doing N× duplicate work with side-effecting GETs.

| ID | Task | Effort |
|---|---|---|
| BUG-2 | Shared bar-based WIN/LOSS resolution (`evalBarExit`), driven by candle events, fee-aware | Medium |
| BUG-6 | Stop recording signals computed from stale data into learning stores | Small |
| BUG-7 | Asset-filter `getMLProbability` (no BTC/PAXG pooling) | Small |
| BUG-8 | Drop forming higher-timeframe candles from live MTF (`slice(0, -1)`) | Small |
| BUG-9 | Align backtest hold window with live; disclose remaining engine divergences | Medium |
| PERF-1 | Compute-once memo per (asset, closed candle) + MTF cache; make `/api/signals` read-only | Medium |
| SEC-2 | Backtest route: TTL cache + single-flight (event-loop DoS) | Medium |
| Q-4 | Extract shared `lib/tradeLifecycle.ts` (twin stores' copy-pasted resolvePending) | Medium |
| Q-5 | Centralize thresholds in `lib/config.ts`; serve UI-relevant constants in the payload | Small |
| ST-2 | Lazy Binance connect (no websocket/REST at module import — build and tests currently hit the network) | Small |
| BUG-10 | Join BTC/PAXG correlation series on `candle.time`, not array index | Small |
| BUG-11 | Label backtest truncation honestly; propagate partial-fetch errors | Small |
| TEST-1 (core) | Tests for signalEngine thresholds/gate, riskManagement stop/target math, resolution edges | Medium |

**Exit criteria:** live resolution and the backtester share one bar-based exit evaluator;
unwatched trades resolve on candle events, not visitor traffic; one signal computation per
closed candle regardless of client count; `/api/signals` GET is side-effect-free; unit tests
run with no network; new engine/risk/resolution tests green.

### Phase 2 — Design system & decomposition (1–2 weeks)

**Goal:** break the monolith, unify the type system, and make the UI's honesty policy
consistent and accessible.

| ID | Task | Effort |
|---|---|---|
| Q-2 | Split the 1,659-line `page.tsx` (theme/hooks/ui/panels/tabs, ~11 mechanical steps) | Large |
| Q-3 | Import types from `lib/types.ts` only; delete ~30 drifted hand-copies | Medium |
| Q-8 | Discriminated `StreamEvent` union for the SSE wire boundary | Medium |
| — | Design-system tokens: radii, buttons, typography (load the declared mono font) — see DESIGN_SYSTEM.md | Medium |
| A11Y-2 | CopyPriceCell as a real `<button>` + aria-live "Copied" | Small |
| A11Y-3 | Headings, landmarks, announced signal flips/STALE warnings, non-colour state | Medium |
| A11Y-4 | Contrast fixes (pill text 4.26:1 at 11–13 px) and font-size floors | Small |
| UX-4 | One confidence label/colour helper + one disclosure rule (currently 5 threshold schemes) | Small |
| Q-6 | Surface calibration (realizedWinRate, confidenceLabel) via `/api/performance` | Medium |
| Q-7 | Delete dead code (`lib/monteCarlo.ts`, unused helpers) — also retires BUG-15 | Small |

**Exit criteria:** no component file over ~300 lines; single source of truth for types and
for the SSE protocol; calibration visible in the UI with the same semantics as the module;
keyboard-only operation of every control.

### Phase 3 — UX & responsive (1–2 weeks)

**Goal:** one truthful verdict surface, honest states everywhere, and a UI that works below
900 px (current mobile score: 1/10).

| ID | Task | Effort |
|---|---|---|
| UX-1 | Consolidate the three conflicting verdict surfaces on TradeCallCard | Medium |
| Q-1 | Retire legacy `generateSignal` (SignalCard can currently say BUY while TradeCallCard says WAIT) | Medium |
| UX-2 | Remove the fabricated "ACTIVE WINDOW / NEXT CHANGE" timing widget and fake client RSI | Small |
| UX-3 | Client-side staleness watchdog (dead SSE currently leaves an actionable BUY on screen) | Small |
| UX-5 | Real empty state for zero-history performance panel (no red "0.0% win rate") | Small |
| UX-6 | Surface backtest failures; invalidate stale results on asset/period change | Small |
| UX-8 | Fix the distribution chart's "you are here" marker | Small |
| UX-9 | Explain waiting states, surface fetch errors, first-run PAXG proxy disclosure | Medium |
| UX-7 | Draw entry/stop/target on the price chart (ReferenceLine already imported) | Medium |
| A11Y-5 | Responsive grids (`minmax()`/auto-fit), wrapping sticky bars, `prefers-reduced-motion` | Medium |

**Exit criteria:** exactly one place states the verdict; nothing on screen displays a number
the system did not measure; usable at 375 px; motion respects user preference.

### Phase 4 — Performance (days)

**Goal:** stop the client burning CPU and trim the bundle. Deliberately late: correctness
first, and Q-2's component split (Phase 2) is what makes real memoization boundaries possible.

| ID | Task | Effort |
|---|---|---|
| PERF-2 | Memoize asset columns / computeAnalysis; delete tick effect; cache hidden-axis date formatting | Small–Medium |
| PERF-3 | `next/dynamic` the recharts components (207 kB first load) | Small |
| PERF-4 | Cache backtest candles by (symbol, interval, period); yield or move off the event loop | Medium |

**Exit criteria:** no full-page re-render on every price tick; measurable first-load
reduction; repeat backtests served from cache without blocking the event loop.

### Phase 5 — Advanced (optional, after real users)

**Goal:** deepen data quality once the foundation is trustworthy. Explicitly optional.

| ID | Task | Effort |
|---|---|---|
| — | 1m backtest interval (match the live cadence) | Medium |
| BUG-12 | Calibration-driven EV/trade quality (replace hard-coded winProb = 0.40 + score×0.001) | Medium |
| BUG-13 | DST-aware session boundaries; honest sessionHigh/Low semantics | Small |
| BUG-14 | Fix newsRisk calendar windows (CPI/FOMC dates; weekend HIGH blocks STRONG on 24/7 BTC) | Small |
| — | Export/import of `.data/` learning stores | Small |
| — | Mobile-first design pass beyond A11Y-5's mechanical fixes | Large |

## Full prioritized backlog

Priority is the canonical audit tier (P0–P3). Impact reflects the canonical severity where
one was assigned; unbracketed P2/P3 items inherit their tier. Difficulty is the audit's
effort estimate.

| ID | Task | Category | Priority | Difficulty | Impact | Dependencies |
|---|---|---|---|---|---|---|
| SEC-1 | Upgrade Next.js (14.2.35 now; 15.5.24+ closes Windows RCE) | SECURITY | P0 | Small | Critical | — |
| BUG-1 | MACD "crossover" tautology; dead ±10 branches (4 call sites) | BUG | P0 | Medium | High | — |
| BUG-2 | Optimistic live WIN/LOSS resolution (close-only, fee-free, visitor-driven) | BUG | P0 | Medium | High | Q-4 (co-implement) |
| BUG-3 | Direction-blind MTF confidence bonus inverts short confidence | BUG | P0 | Small | High | — |
| BUG-4 | Asymmetric STRONG-gate MTF check (HOLD counted as bearish) | BUG | P1 | Small | Medium | — |
| BUG-5 | Kline open-time treated as close-time → false STALE banner | BUG | P1 | Small | Medium | — |
| BUG-6 | Stale-data signals recorded into learning stores | BUG | P1 | Small | Medium | — |
| BUG-7 | getMLProbability pools BTC and PAXG history | BUG | P1 | Small | Medium | — |
| BUG-8 | Live MTF scores still-forming 5m/15m/1h/4h candles | BUG | P1 | Small | Medium | — |
| BUG-9 | "Same engine" backtest claim vs 4 undisclosed divergences | DOCUMENTATION | P1 | Medium | High | — |
| ST-1 | Non-atomic writes, no shutdown flush, swallowed write errors | DATA | P1 | Small | Medium | — |
| PERF-1 | Per-client recompute + uncached MTF fetches; mutating GET | PERFORMANCE | P1 | Medium | Medium | — |
| SEC-2 | /api/backtest event-loop DoS (no cache/rate-limit/single-flight) | SECURITY | P1 | Medium | Medium | — |
| Q-1 | Retire legacy generateSignal (conflicting SignalCard verdict) | ARCHITECTURE | P1 | Medium | High | — |
| UX-1 | Consolidate three conflicting verdict surfaces on TradeCallCard | UX | P1 | Medium | High | Q-1 |
| UX-2 | Remove fabricated minute-precision timing widget + fake client RSI | UX | P1 | Small | High | — |
| UX-3 | Client-side staleness watchdog for dead SSE connections | UX | P1 | Small | High | — |
| Q-2 | Split the 1,659-line page.tsx monolith | ARCHITECTURE | P2 | Large | Medium | — |
| Q-3 | Unify on lib/types.ts; delete drifted shadow interfaces | ARCHITECTURE | P2 | Medium | Medium | — |
| Q-4 | Extract shared lib/tradeLifecycle.ts from twin stores | ARCHITECTURE | P2 | Medium | Medium | — |
| Q-5 | Centralize thresholds in lib/config.ts; serve constants in payload | ARCHITECTURE | P2 | Small | Medium | — |
| Q-6 | Surface calibration outputs via /api/performance | API | P2 | Medium | Medium | Q-5 |
| Q-7 | Delete dead code (monteCarlo.ts, unused helpers) | ARCHITECTURE | P2 | Small | Medium | — |
| Q-8 | Typed StreamEvent union for the SSE wire boundary | API | P2 | Medium | Medium | — |
| ST-2 | Lazy Binance connect (network at module import) | ARCHITECTURE | P2 | Small | Medium | — |
| ST-3 | SSE robustness: cancel() handler, guarded enqueue, backpressure | API | P2 | Small | Low | — |
| PERF-2 | Unmemoized 3–6/s full-page re-renders; tick effect; formatter waste | PERFORMANCE | P2 | Small–Medium | Medium | Q-2 (partial) |
| PERF-3 | 207 kB first load — next/dynamic recharts | PERFORMANCE | P2 | Small | Medium | — |
| PERF-4 | Backtest refetches + sync event-loop block; cache candles | PERFORMANCE | P2 | Medium | Medium | SEC-2 (shared cache) |
| BUG-10 | Correlation pairs series by index, not timestamp | BUG | P2 | Small | Medium | — |
| BUG-11 | Backtest truncation mislabelled; partial-fetch errors dropped | BUG | P2 | Small | Medium | — |
| BUG-12 | EV/quality from hard-coded winProb, never measured outcomes | BUG | P2 | Medium | Low | — |
| UX-4 | One confidence disclosure rule (5 threshold schemes today) | UX | P2 | Small | Medium | — |
| UX-5 | Real empty state for zero-history performance panel | UX | P2 | Small | Medium | — |
| UX-6 | Surface backtest failures; invalidate stale results | UX | P2 | Small | Medium | — |
| UX-7 | Draw entry/stop/target on the price chart | UI | P2 | Medium | Medium | — |
| UX-8 | Fix "you are here" distribution marker (never renders) | UI | P2 | Small | Medium | — |
| UX-9 | Explain waiting states; surface fetch errors; PAXG disclosure | UX | P2 | Medium | Medium | — |
| UX-10 | Remove dev artifacts (#tick, "PHASE 22", stale metadata) | UI | P2 | Small | Medium | — |
| A11Y-1 | Restore focus visibility (global outline:none) | UI | P2 | Small | Medium | — |
| A11Y-2 | CopyPriceCell click-only div → button + aria-live | UI | P2 | Small | Medium | — |
| A11Y-3 | Landmarks, headings, announcements, non-colour state | UI | P2 | Medium | Medium | — |
| A11Y-4 | Contrast failures at small sizes; font floors | UI | P2 | Small | Medium | — |
| A11Y-5 | Responsive grids, wrapping bars, reduced-motion guard | MOBILE | P2 | Medium | Medium | — |
| BUG-13 | Fixed-UTC session boundaries (DST off by 1h ~8 months/yr) | BUG | P3 | Small | Low | — |
| BUG-14 | newsRisk calendar windows misaligned; weekend HIGH blocks STRONG | BUG | P3 | Small | Low | — |
| BUG-15 | Monte Carlo double Itô correction | BUG | P3 | Small | Low | Q-7 (deletion supersedes) |
| BUG-16 | EMA seed weight / ATR variant — fix or document | BUG | P3 | Small | Low | — |
| ST-4 | SSE dedup monotonicity; nondeterministic ids; sync ~1 MB writes | BACKEND | P3 | Small | Low | — |
| SEC-3 | Raw error text, missing security headers, symbol-whitelist hygiene | SECURITY | P3 | Small | Low | — |
| TEST-1 | Coverage gaps: engine thresholds, risk math, routes, resolution edges, page.tsx | TESTING | P3 | Large | Low | ST-2 |

## Recommended single next step

**Upgrade Next.js (SEC-1).** Run `npm install next@14.2.35` now — non-breaking per npm — and
plan the move to Next 15.5.24+ to fully close the Windows RCE (GHSA-p293-qw3h-jr36; this host
is Windows 11 and `next dev` binds 0.0.0.0). It is the only critical-severity item in the
register, takes minutes, and is verified by the existing green build and test suite.

The first substantive engineering task after that: the signal-math trio — **BUG-1 + BUG-3 +
BUG-4** — each with a regression test, then **BUG-2** (shared bar-based resolution), which is
the fix that makes every historical statistic the app shows worth trusting.
