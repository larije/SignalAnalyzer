# Technical Debt Register — xau-analyzer

Audit snapshot: 2026-09-15. Canonical source of finding IDs, severities, and priorities.
Sibling documents: IMPROVEMENT_ROADMAP.md (phased plan), and the architecture/UX docs in this folder.
File paths are relative to the `xau-analyzer/` app folder.

## How to read this register

Findings are classified into four priority tiers:

| Tier | Meaning |
|---|---|
| 🔴 P0 | Critical — fix before anything else |
| 🟠 P1 | High — materially wrong behaviour or trust damage |
| 🟡 P2 | Medium — quality, performance, UX, accessibility debt |
| 🟢 P3 | Low — latent, cosmetic, or moot issues |

Every objective finding below survived **2-vote adversarial verification**: two independent
verifiers re-read the cited code and had to confirm both the mechanism and the impact. Where
the verifiers confirmed the mechanism but shrank the blast radius, the finding is marked
*downgraded* and the reasoning is preserved (it matters for prioritisation). Two outcomes are
worth flagging up front:

- **One CONTESTED item (ST-3):** the SSE robustness claim was confirmed at code level but its
  headline impacts (permanent event starvation, process crash) were refuted against the actual
  Next.js 14.2.3 runtime. It stands as a low-severity hygiene item.
- **One REFUTED security claim:** the alleged symbol-injection via `/api/candles` (part of
  SEC-3) was disproved — input uppercasing plus Binance's strict parameter validation make it
  inert. It remains listed as hygiene only, not a vulnerability.

Where a defect corrupts data or a headline metric, both the current behaviour and the defect
are documented so this snapshot stays truthful.

---

## 🔴 P0 — Critical

### SEC-1 — Next.js 14.2.3 carries a critical RCE advisory on this exact host
**Severity:** critical, confirmed · **Location:** `package.json:14` · **Effort:** small

Next.js 14.2.3 has 30+ advisories, including GHSA-p293-qw3h-jr36 — unauthenticated remote code
execution on Windows hosts. This app is developed on Windows 11 and `next dev` binds 0.0.0.0,
so the advisory's preconditions are met. There are also high-severity Server Components DoS
advisories in the same range.
**Fix:** `npm install next@14.2.35` now (non-major, per `npm audit`); plan the move to
Next 15.5.24+ to fully close the Windows RCE. The green build/test suite verifies the upgrade.

### BUG-1 — MACD "crossover" is a tautology; MACD always contributes the full ±25
**Severity:** high, confirmed · **Location:** `lib/signalEngine.ts:124`, `lib/technicalAnalysis.ts:131` · **Effort:** medium

Histogram is defined as exactly `value − signal`, so `histogram > 0 && value > signal` is true
on *every* bar MACD sits above signal — not only on the crossing bar. The ±10 momentum branches
are dead code, MACD is over-weighted 2.5× on every non-cross bar (the spurious +15 is 60% of the
BUY threshold of 25), and the displayed reason "MACD bullish crossover" is false almost every
time it appears. The same class of bug exists in legacy `generateSignal`
(`lib/signalEngine.ts:41-46`), `lib/multiTimeframe.ts:52-55` (±20 fires where ±8 was intended),
and `lib/confidenceModel.ts:40` (`|histogram| > 0` → +2 always). Verifiers confirmed the blast
radius covers live signals, the backtester, and persisted history; the one mitigation is that
live and backtest share the same wrong formula, so tracked stats are at least internally consistent.
**Fix:** add `prevHistogram` to the `Indicators` interface and detect a real cross as a sign
change (`histogram > 0 && prevHistogram <= 0`); apply in all three engines.

### BUG-2 — Live WIN/LOSS resolution is optimistic versus the backtester on four axes
**Severity:** high, confirmed · **Location:** `lib/signalHistory.ts:104`, `lib/patternDatabase.ts:148`, `lib/liveSignal.ts:102` · **Effort:** medium

Live outcome tracking (1) checks only the 1m CLOSE, so intrabar wick stop-outs are invisible;
(2) records exits at the close price rather than the stop/TP level; (3) deducts no
fees/spread/slippage while the backtest charges 0.15%; and (4) is visitor-driven — resolution
runs only when an SSE client or `/api/signals` poll triggers a compute, so unwatched trades
resolve hours late at stale prices (age ≥ 60 min → TIMEOUT with a fabricated exit price).
This corrupts the win rate, expectancy, calibration buckets, and adaptive weights — the app's
core honesty promise. Verifier nuance: TIMEOUTs are excluded from calibration and the learners,
so the corruption enters as wrong WIN/LOSS labels at stale prices plus systematic *omission* of
real wick losses (an upward win-rate bias), not as TIMEOUT labels in training data.
**Fix:** share the backtester's bar-based `evalBarExit` (high/low, both-touch = LOSS, exit at
the level, costs deducted) and drive resolution from `binanceService` candle events in a single
process-lifetime subscription.

### BUG-3 — Confidence model's MTF bonus is direction-blind; every short's confidence is inverted
**Severity:** high, critic-found · **Location:** `lib/confidenceModel.ts:27` · **Effort:** small

The bonus is `(mtf.alignment / 100) * 20`, where alignment is defined as the *bullish* share of
timeframes. A SELL confirmed by all-bearish timeframes therefore gets +0, while a SELL
contradicted by all-bullish timeframes gets +20 — up to a 40-point swing, systematically
inverted for every short. This feeds the TradeCallCard label and the calibration store.
**Fix:** use directional alignment (bearish share for sells) before scaling to 20 points.

---

## 🟠 P1 — High

### BUG-4 — STRONG-gate MTF check is asymmetric: HOLD timeframes count as bearish
**Severity:** medium, confirmed (keep) · **Location:** `lib/signalEngine.ts:245`, also `lib/marketRegime.ts:76` · **Effort:** small

The bear side gates on `(100 − alignment) ≥ 80`, which counts every non-bullish timeframe —
including HOLDs — as bearish confirmation. 1 SELL + 4 HOLD passes the bear gate; the mirror
(1 BUY + 4 HOLD) fails the bull gate, so STRONG_SELL is systematically easier to emit than
STRONG_BUY. Verifiers kept it at medium: the asymmetry falsifies the headline trust feature but
does not change trade direction, entries, or stops.
**Fix:** compute bearish alignment explicitly from `mtf.bearishCount` and gate on it.

### BUG-5 — Candle `time` is the kline OPEN time but treated as close time; false STALE banners
**Severity:** medium, critic-found · **Location:** `lib/liveSignal.ts:41`, `lib/binanceService.ts:94`, `app/api/stream/route.ts:68-75`, `app/page.tsx:1161` · **Effort:** small

`isStale(90s)` measures age from the kline's open time, so it fires on perfectly healthy data
during the last ~30 seconds of each minute — a false "STALE — DO NOT TRADE" banner on roughly
half of first loads, flapping against the heartbeat (which uses a different time reference).
The "Signal as of" timestamp is also off by one minute.
**Fix:** derive close time (`time + 60_000`) or carry the kline close time through, and use one
reference for both staleness and the heartbeat.

### BUG-6 — Signals computed from STALE data are still recorded into the learning stores
**Severity:** medium, critic-found · **Location:** `lib/liveSignal.ts:122` · **Effort:** small

When the feed is stale the UI says "do not trade", but `computeSignalForAsset` still records
the signal into `signalHistory` and `patternDatabase`. During feed outages the app fills its
history with synthetic TIMEOUT trades computed from frozen prices.
**Fix:** skip (or tag) `record()` when the staleness flag is set.

### BUG-7 — getMLProbability pools BTC and PAXG trades together
**Severity:** medium, critic-found · **Location:** `lib/patternDatabase.ts:174` · **Effort:** small

Unlike `getAdaptiveWeights`, `getMLProbability` applies no asset filter, so the "win rate of
similar past signals" — and its 20-sample honesty gate — can be satisfied by the *other*
asset's history. The number shown for XAU can be mostly Bitcoin trades.
**Fix:** filter records by asset, matching the adaptive-weights behaviour.

### BUG-8 — Live MTF scores still-forming higher-timeframe candles
**Severity:** medium, critic-found · **Location:** `lib/multiTimeframe.ts:103` · **Effort:** small

Only the 1m base series drops its forming bar; the fetched 5m/15m/1h/4h series include the
in-progress candle, so partial-bar data leaks into the ±25 MTF score and the STRONG gate —
diverging from the app's closed-bar, non-repainting semantics.
**Fix:** `slice(0, -1)` on each fetched higher-timeframe series.

### BUG-9 — README's "backtest runs the SAME engine" claim overstates; four undisclosed divergences
**Severity:** high, critic-found · **Location:** `lib/backtesting.ts:112,146` vs `lib/signalHistory.ts:108` · **Effort:** medium

Live and backtest actually diverge four ways: the backtest uses no adaptive weights, stubs
correlation to neutral, runs on 5m+ intervals versus 1m live, and holds trades up to 24 hours
versus the 60-minute live timeout. Users comparing backtest and live stats are comparing
different systems under identical labels.
**Fix:** align the hold window and disclose the remaining divergences in the UI and README.

### ST-1 — Persistence integrity: non-atomic writes, silent corruption loss, no shutdown flush
**Severity:** medium, confirmed · **Location:** `lib/storage.ts:29,48` · **Effort:** small

`writeFileSync` writes directly to the target file — a crash mid-write truncates the JSON;
`loadJson` then silently falls back to the empty state and the next save overwrites the corrupt
file, making the loss of the entire learning database permanent and undetectable. Separately,
`flushNow` claims shutdown use in its docstring but nothing wires it: the last 500ms of
debounced writes are lost on every Ctrl+C (verifiers note lost *resolutions* self-heal on
restart because the trade reloads as PENDING; a freshly recorded trade in the window is gone).
Write errors are swallowed with no log.
**Fix:** write to a `.tmp` file and `renameSync` over the target; register guarded
SIGINT/SIGTERM/beforeExit handlers calling `flushNow`; log write and parse failures once.

### PERF-1 — Signal computation duplicated per SSE client and per poll; mutating GET
**Severity:** high→medium after verification, confirmed · **Location:** `app/api/stream/route.ts:36-52`, `lib/multiTimeframe.ts:103`, `app/api/signals/route.ts:8` · **Effort:** medium

Each SSE connection recomputes the identical signal on every candle close (the per-connection
dedup only suppresses re-*emission*), each compute fires 4 uncached Binance REST calls, and
every open tab additionally polls `/api/signals` every 30s — N tabs = N× identical work and 8N
fetches/min. `/api/signals` also *mutates* the learning stores on an anonymous GET, so any
crawler or curl drives state. **Downgrade rationale:** verifiers ran the budget maths — one tab
generates ~24 requests/min against Binance's 6,000 weight/min IP limit, roughly two orders of
magnitude below ban territory — so the "IP ban" risk was overstated; the architecture is still
wrong and side effects multiply by connection count.
**Fix:** compute-once memo keyed `(asset, closedCandleTime)`, a module-level MTF cache
(~55s TTL), and a read-only `/api/signals`.

### SEC-2 — /api/backtest blocks the event loop with no cache, rate limit, or single-flight
**Severity:** high→medium after verification, confirmed · **Location:** `lib/backtesting.ts:40,163` · **Effort:** medium

Each request runs a synchronous simulation loop of ~0.5–1.6s on the shared event loop, with no
caching or concurrency guard — an availability DoS if the app were ever deployed, and a
self-inflicted stall (frozen SSE updates) locally. Downgraded because the app is a local
single-user tool by design; the exposure is conditional on deployment.
**Fix:** TTL cache keyed by (symbol, interval, period) plus single-flight de-duplication.

### Q-1 — Legacy generateSignal still renders as the primary SignalCard badge
**Severity:** high · **Location:** `lib/signalEngine.ts:28`, `app/page.tsx:679` vs `app/page.tsx:1152` · **Effort:** medium

The legacy engine (different thresholds, no regime multiplier, no gate, its own SL/TP maths)
survives solely to fill a backward-compat field, yet the UI renders it as the primary SignalCard
badge while TradeCallCard on the same screen shows the enhanced verdict. The two cards can say
BUY and WAIT simultaneously for the same asset — directly undermining the "one honest signal"
premise.
**Fix:** point SignalCard at the enhanced signal, then delete `generateSignal` from the live path.

### UX-1 — Three conflicting verdict surfaces on the Market tab
**Severity:** high impact · **Location:** `app/page.tsx` (Market tab) · **Effort:** medium

TradeCallCard (BUY/SELL/WAIT), SignalCard (BUY/HOLD plus a "timing" widget), and the top-bar
pills each render a verdict, with entry/stop/target duplicated and three different vocabularies
for "do nothing". Users must guess which surface is authoritative.
**Fix:** consolidate on TradeCallCard; demote or remove the other verdict surfaces (see UX docs).

### UX-2 — Fabricated minute-precision "ACTIVE WINDOW / NEXT CHANGE" timing widget
**Severity:** high impact · **Location:** `app/page.tsx:163-189,127-154` · **Effort:** small

The timing windows are derived from RSI distance-to-50 multiplied by magic constants — they are
invented numbers presented as trading guidance, and they repaint intrabar, contradicting the
NON-REPAINTING header above them. The client-side `computeAnalysis` "RSI" also divides by a
hardcoded 14 regardless of sample count, so it is not RSI and disagrees with the tested Wilder
implementation rendered beside it.
**Fix:** delete the widget or replace it with honest facts (candle close countdown, signal age).

### UX-3 — No client-side staleness watchdog: a dead SSE connection freezes an actionable BUY
**Severity:** high impact · **Location:** `app/page.tsx:241-251` · **Effort:** small

The stale flag is only ever set by server-sent freshness events. If the SSE connection dies
silently, no further events arrive — including the stale event — so the UI keeps displaying an
actionable signal with frozen prices indefinitely.
**Fix:** client-side timer that flags staleness when no event has arrived within the threshold.

---

## 🟡 P2 — Medium

| ID | Title · Location | Description | Fix | Effort |
|---|---|---|---|---|
| Q-2 | page.tsx monolith · `app/page.tsx:1` | One 1,659-line client file holds the design tokens, a hand-copied type system, analytics helpers, the SSE hook, all shared primitives, ~25 panels, and five inline tab bodies. The trust-improvements plan promised this split and never delivered it (see Payoff order below). | Extract theme / hooks / ui / panels / per-tab components in ~11 mechanical, independently shippable steps. | large |
| Q-3 | Shadow types drifting · `app/page.tsx:43`, `lib/types.ts:1` | page.tsx hand-copies ~30 interfaces from `lib/types.ts` and has already drifted (optional-vs-required mismatches, missing fields); six lib modules also declare structurally identical local copies. Server-side field renames compile cleanly while the client silently receives `undefined`. | Delete local copies; `import type` from `lib/types.ts` everywhere. | medium |
| Q-4 | Twin trade stores · `lib/patternDatabase.ts:148` | `signalHistory` and `patternDatabase` duplicate the whole trade lifecycle — `resolvePending` is a line-for-line copy — with different caps (500 vs 1000) and unrelated id schemes, so any resolution fix must land twice or the ledgers diverge. | Extract shared `lib/tradeLifecycle.ts`; longer term make patternDatabase the single source. | medium |
| Q-5 | Thresholds hardcoded in 3 layers · `lib/signalEngine.ts:200` | The 15-sample minimum, 60-min timeout, 80/75 gate, and `STALE_MS` are re-declared as literals in the engine, the stores, and UI copy. Tuning any threshold requires a repo-wide literal hunt, and a missed one leaves the UI describing a gate the engine no longer enforces. | Create `lib/config.ts`; serve UI-relevant constants in the signal payload. | small |
| Q-6 | Calibration built but never surfaced · `lib/confidenceCalibration.ts:39` | `realizedWinRate` / `showNumericConfidence` / `confidenceLabel` are fed in production but read only by tests; the UI re-implements both with drifted semantics (its ≥30 gate counts TIMEOUTs; the module counts decided outcomes only). | Expose calibration via `/api/performance`; have TradeCallCard consume it. | medium |
| Q-7 | Dead code · `lib/monteCarlo.ts:21` | `runMonteCarlo` has zero importers (verified repo-wide), as do `confidenceColor`/`confidenceLabel`, `newsRiskColor`, `PageSection`, and `SignalTiming.actionBg`. 108 lines of GBM simulation must be read and typechecked on every audit for nothing. | Delete; git history keeps it if Monte Carlo returns. | small |
| Q-8 | Untyped SSE wire boundary · `app/api/stream/route.ts:42` | The server spreads anonymous objects into `send()`; the client parses to `Record<string, unknown>` and re-casts field by field. A renamed field compiles on both sides and fails silently at runtime. | Define a discriminated `StreamEvent` union in `lib/types.ts`, typed on both ends. | medium |
| ST-2 | Network at import time · `lib/binanceService.ts:190` | The websocket connects and REST fires as a module-import side effect — `next build` and `vitest run` open real Binance connections (empirically verified: build logged two live connections; unit tests logged one). Confirmed; verifiers noted builds completed and tests passed regardless, so it is a hygiene/isolation defect rather than a breakage. | Lazy, idempotent `connect()` invoked from the route handlers. | small |
| ST-3 | SSE robustness · `app/api/stream/route.ts:19-22` | **CONTESTED→low.** No `cancel()` handler, unguarded `ctrl.enqueue`, no backpressure check — all confirmed at code level. But verifiers refuted the headline impacts against the actual runtime: Next's `uncaughtException` handler prevents the claimed process crash, and abort/close wiring makes the "permanent starvation" a sub-tick race. Residual risk: missed-event windows and unbounded buffering on half-open connections. | One shared cleanup called from abort, a new `cancel()`, and a `try/catch` in `send()`. | small |
| PERF-2 | Full-page re-renders 3–6×/sec · `app/page.tsx:1268` | Zero `useMemo`/`memo`/`useCallback` anywhere; a `setTick` effect doubles the render rate just to display a counter; MiniChart formats 160 dates per render via uncached `toLocale*` for a *hidden* axis (measured 4–6 ms/render, 19–69× slower than cached). | Delete tick + dead formatting (small); memo asset columns, compute `computeAnalysis` only on its tab (medium). | small–medium |
| PERF-3 | 207 kB gz first load · `app/page.tsx` | Recharts is eagerly imported in the single client page, dominating the bundle. | `next/dynamic` the chart components. | small |
| PERF-4 | Backtest refetch + sync loop · `lib/backtesting.ts` | Every click refetches the full candle history and runs a synchronous loop (~0.1–0.7s block) on the shared event loop. | Cache candles by (symbol, interval, period); yield periodically or move to a worker. | medium |
| BUG-10 | Correlation pairs by index · `lib/correlationAnalysis.ts:57` | Confirmed, **downgraded**: BTC/PAXG returns are paired positionally, never by timestamp. Verifiers found both symbols share one multiplexed socket, so stream gaps drop the same minutes from both buffers — the realistic desync (zero-trade PAXG minutes, one-sided backfill) can only *mute* the ±4 component toward 0, not bias direction. | Join the two series on `candle.time`; require ~30 shared minutes. | small |
| BUG-11 | Backtest truncation + swallowed fetch errors · `lib/backtesting.ts:40,262` | Confirmed, **downgraded**: fetches cap at 5,000 bars but the result is labelled with the requested period. Not reachable from the shipped UI (hardcoded 1h × 30–180d = max 4,320 bars) — only via direct API calls. Also `runBacktest` drops the partial-fetch error field, so a mid-pagination failure yields confident stats over a fraction of the period, or a fake all-zero "no trades" result. | Report actual covered range; propagate fetch errors. | small |
| BUG-12 | Fabricated EV / trade quality · `lib/riskManagement.ts:63`, `app/page.tsx:537-552` | Low, critic-found: EV and the EXCELLENT/GOOD/POOR grade derive from a hard-coded `winProb = 0.40 + |score|×0.001` — never from recorded outcomes — yet are presented as authoritative. | Wire to measured calibration data, or relabel as a static heuristic. | medium |
| UX-4 | Inconsistent confidence-honesty policy · `app/page.tsx` | Numeric confidence is hidden in TradeCallCard behind the 30-sample gate but leaked verbatim in 3 other surfaces using 5 different threshold schemes. | One `confLabel`/`confColor` helper and one disclosure rule. | small |
| UX-5 | Alarming fake zero-history metrics · `app/page.tsx:611-638` | With no history the Performance panel renders a red 0.0% win rate as if the system were failing. | Real empty state. | small |
| UX-6 | Silent backtest failure · `app/page.tsx:1298-1308` | An empty `catch` turns any backtest error into a blank panel; stale results are not invalidated on asset/period change. | Error state + result invalidation. | small |
| UX-7 | Levels never drawn on the chart · `app/page.tsx` | Entry/stop/target are never plotted (ReferenceLine is already imported); axes are hidden. | Draw the three levels; show a minimal axis. | medium |
| UX-8 | "You are here" marker almost never renders · `app/page.tsx:1578-1581` | The distribution chart matches a category axis label against a rounded price for exact equality, which almost never holds. | Match on nearest bucket. | small |
| UX-9 | Unexplained waiting states, swallowed fetch errors · `app/page.tsx` | The first signal can take a full minute with no explanation; all fetch errors are swallowed (blank tabs forever); the PAXG proxy is only explained in the footer. | Loading/error states; first-run note. | medium |
| UX-10 | Dev artifacts in production · `app/page.tsx:1058` a.o. | `#{tick}` counter in the top bar, "PHASE 22" panel title, layout metadata still says "powered by AI" (feature removed), body background mismatch. | Remove/rename. | small |
| A11Y-1 | Focus visibility destroyed · `app/page.tsx:1653` | Global `button{outline:none}` kills all keyboard focus indication. | One-line `:focus-visible` rule. | small |
| A11Y-2 | CopyPriceCell keyboard-unreachable · `app/page.tsx:344` | The app's most action-critical control (copying entry/stop/target) is a click-only `div`. | Convert to `<button>` + `aria-live` "Copied". | small |
| A11Y-3 | No semantics anywhere · `app/page.tsx` | Zero headings/landmarks/aria in the app; tab state is colour-only; signal flips and STALE warnings are never announced; price-change direction is stripped via `Math.abs` (sign conveyed only by colour/icon). | Landmarks, aria-selected tabs, live regions, signed deltas. | medium |
| A11Y-4 | Contrast failures · `app/page.tsx:28,30` | Red #EF4444 / blue #3B82F6 on tinted pills measure 4.26–4.27:1 — AA fail at the app's 11–13px sizes; 10–11px font floor; 3px scrollbar at 1.41:1. | Adjust the two colours on tinted backgrounds; raise the font floor. | small |
| A11Y-5 | Zero responsive support · `app/page.tsx` | No media queries at all; hard `1fr-1fr` / `1fr-280px` / `repeat(4,1fr)` grids and two sticky non-wrapping 48px bars clip below ~900px; unusable at 375px. No `prefers-reduced-motion` guard on infinite pulses. | `minmax()`/`auto-fit` grids (mostly mechanical); reduced-motion guard. | medium |

---

## 🟢 P3 — Low

| ID | Title · Location | Description | Fix | Effort |
|---|---|---|---|---|
| BUG-13 | DST-blind sessions · `lib/sessionAnalysis.ts:19` | Session boundaries are fixed UTC hours, so London/NY are off by 1h during DST (~8 months/yr); `sessionHigh/Low` are actually last-120-min extremes, not session ranges. | Derive from Europe/London & America/New_York local time; rename or fix the range fields. | small |
| BUG-14 | Misaligned news calendar · `lib/newsRisk.ts:39-51` | CPI window uses dom 10–17 versus the actual 8–14; the FOMC window includes 4th Wednesdays; weekends always score HIGH, blocking STRONG signals on 24/7 BTC every weekend. | Correct the nth-weekday windows; reconsider weekend HIGH for crypto. | small |
| BUG-15 | Monte Carlo double Itô correction · `lib/monteCarlo.ts:53` | Drift is estimated from log returns yet the step subtracts σ²/2 again — a systematic bearish skew. Moot if Q-7 deletes the module. | Delete with Q-7, or pick one drift convention. | small |
| BUG-16 | Indicator seeding conventions · `lib/technicalAnalysis.ts:27,111` | EMA is seeded with the first close (12–14% seed weight at the minimum window, so early EMA50/EMA200 are unconverged); ATR is the SMA variant, not Wilder — defensible, but undocumented. | SMA-seed the EMA; document the ATR variant. | small |
| ST-4 | State-machine hygiene bundle · `app/api/stream/route.ts:40`, `lib/signalHistory.ts:70`, `lib/storage.ts:8` | SSE per-connection dedup uses equality not monotonicity (an in-flight older compute can regress the emitted signal); signalHistory ids are nondeterministic and timestamps drift from candle time; storage's debounce maps are not hot-reload-safe; sync `writeFileSync` of up to ~1MB runs on the event loop. | Monotonic guard; deterministic ids from candle time; move debounce maps to globalThis. | small |
| SEC-3 | Security hygiene bundle · `app/api/backtest/route.ts` a.o. | Backtest route returns raw internal error text; no security headers (frame-ancestors, nosniff); `/api/candles` symbol not whitelisted — the injection claim was **REFUTED** by verification (uppercasing + Binance's strict parameter validation make it inert; whitelist is hygiene only); vitest 2.x advisories are dev-only. | Generic error responses; header set; symbol whitelist. | small |
| TEST-1 | Coverage gaps (from a real run) · `lib/__tests__/` | 51/51 tests pass, but zero coverage of: signalEngine thresholds/gate/NO_TRADE, riskManagement stop/target maths, `computeSignalForAsset` orchestration, binanceService, the SSE route, storage debounce, resolvePending edges, MTF aggregation, resample, indicator maths (only ema200 nullability), all API routes, all of page.tsx. Unit tests also open a real Binance websocket via the ST-2 import side effect. | Add engine/risk/resolution tests first (Phase 1); mock the service in unit tests. | medium+ |

---

## Recommended debt-payoff order

Follow the phases in **IMPROVEMENT_ROADMAP.md** — they were sequenced so that data-corrupting
defects are stopped before the data they corrupt is surfaced or relied upon:

1. **Phase 0 — Stabilisation (days):** SEC-1 first (`npm install next@14.2.35` — the only
   critical item, minutes of work, verified by the green suite), then the signal-math trio
   BUG-1 + BUG-3 + BUG-4 with regression tests, plus BUG-5, ST-1, the UX-10 quick wins, and A11Y-1.
2. **Phase 1 — Trust & data foundation:** BUG-2 (shared bar-based resolution driven by candle
   events) is the centrepiece; with BUG-6/7/8/9, PERF-1's compute-once fan-out and a read-only
   `/api/signals`, SEC-2, Q-4, Q-5, ST-2, BUG-10/11, and the TEST-1 core additions. Every hour
   the learning stores run before this phase accumulates more biased history.
3. **Phase 2 — Decomposition & design system:** Q-2, Q-3, Q-8, A11Y-2/3/4, UX-4, Q-6, Q-7.
4. **Phase 3 — UX & responsive:** UX-1 + Q-1 (verdict consolidation), UX-2, UX-3, UX-5/6/8/9,
   UX-7, A11Y-5.
5. **Phase 4 — Performance:** PERF-2/3/4.
6. **Phase 5 — Advanced (optional):** BUG-12, BUG-13/14, 1m backtest interval, mobile-first pass.

A closing observation on process: the recent trust-improvements branch delivered most of its
spec, but its promised split of `app/page.tsx` (**Q-2**) was never delivered — the file remains
a 1,659-line monolith, and the plan also left calibration unsurfaced in the UI (**Q-6**). Both
were re-promised work, which is why they sit in Phase 2 rather than "nice to have": debt that
has already slipped one plan tends to slip the next unless it is scheduled explicitly.
