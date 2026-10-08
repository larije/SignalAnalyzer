# XAU/BTC Analyzer — Trust & Simplicity Improvements

**Date:** 2026-08-13
**Status:** Approved (pending spec review)

## Problem

The app presents itself as an institutional-grade signal system, but none of the
numbers it uses to prove it works can be trusted:

- The backtest tests a *different, simpler* engine than the live one, and is
  optimistically biased (assumes wins on ambiguous bars, no fees, broken Sharpe).
- Live "win rate" and "ML win probability" are inflated: the same trade is
  recorded every 30s (non-independent samples), trades resolve on spot price only,
  and a +0.01% drift counts as a "win". State is in-memory, so all "learning"
  resets on every restart.
- Confidence %, Monte Carlo odds, and correlation are presented as rigorous but
  are heuristic, statistically invalid, or plain bugs (`avgRR` is always Infinity).
- "Gold" is actually PAXG (a crypto token), never labeled as such.
- The "AI analysis" was Claude generating authoritative-sounding but unverified prose.
- No disclaimer, no tests, 1,758-line UI file.

## Goals

1. **Correctness** — every displayed number is either right or clearly labeled as an estimate.
2. **Honesty** — no metric implies more rigor than it has; unproven stats stay hidden until real data backs them.
3. **Simplicity** — a non-technical trader sees one clear call; the code is smaller and plainly named.
4. **Free** — no API keys, no paid feeds. Binance only.
5. **Real-time & non-repainting** — a fresh confirmed signal fires within ~1–2s of each
   1-minute candle close, and never changes after it fires. What you copy is what you trade.

## Non-goals

- Real XAU/USD spot feed or real economic-calendar API (explicitly out of scope; free-only).
- Keeping the Claude AI analysis (removed — user no longer has an API key).
- Making the strategy profitable. We make it *honest*, not necessarily *good*.

## Design — 6 phases

Each phase is independently testable and shippable.

### Phase 1 — Fix the broken math

| File | Change |
|------|--------|
| `lib/signalHistory.ts` | Fix `avgRR` divide-by-zero (always `Infinity`). Compute avg R:R as `avg(win pnl) / avg(loss pnl)` or drop it. |
| `lib/signalHistory.ts`, `lib/backtesting.ts` | Remove bogus `√252` Sharpe. Report per-trade Sharpe honestly, or drop annualization. |
| `lib/correlationAnalysis.ts` | Correlate **log returns**, not raw price levels. Widen window from 50×1m to a meaningful sample. Drop or clearly flag the hardcoded DXY/US10Y/Nasdaq/ETH "notes" as *not live data*. |
| `lib/technicalAnalysis.ts` | Only expose `ema200` when ≥200 candles exist; otherwise expose `ema200: null` and callers must not label it "EMA200". |
| `lib/newsRisk.ts` | Fix NFP/CPI DST hour drift; rename output to make clear it is a *time-based estimate*, not a live calendar. |

### Phase 2 — Honest metrics

- **Confidence:** keep the internal quality score, but surface it as a **label**
  (`Weak` / `Medium` / `Strong`) by default. Show the numeric % only after the
  calibration store has ≥30 resolved trades whose realized win rate is tracked per
  confidence bucket. Add a small calibration map (bucket → realized win rate).
- **Win definition:** a trade is `WIN` only if it **hit take-profit before stop**.
  Timeouts become their own `TIMEOUT` outcome (not folded into WIN). Applies to
  `signalHistory` and `patternDatabase`.
- **De-duplicate recording:** record a trade only when the *setup changes*
  (new direction, or previous trade resolved), not every 30s. Add a guard: skip
  recording if an unresolved trade for the asset with the same direction already exists.
- **ML win probability / win-rate stats:** hidden in the UI until
  `completedSignals >= 30`. Always shown *with* sample size. Remove the fabricated
  `sampleSize = weightedTotal / 8`; report the real matched-trade count.
- **Monte Carlo:** relabel from "up probability X%" to a plain **"likely 24h range"**
  (p25–p75 band). Keep the cone chart; drop the win-odds framing.

### Phase 3 — Persistence

- Add `lib/storage.ts`: load/save JSON to `.data/history.json` and `.data/patterns.json`
  (gitignored). `signalHistory` and `patternDatabase` load on init and save on each mutation
  (debounced). No database. Survives restarts.

### Phase 4 — Trustworthy backtest

Rewrite `lib/backtesting.ts` to:
- Run the **enhanced** signal logic on each historical bar (reconstruct candle-only
  modules: structure, volume, pattern, SMC, regime, volatility; reconstruct time-based
  modules session/news from each bar's timestamp; derive MTF by resampling the fetched
  base interval into higher timeframes).
- Fix the off-by-one: check the bar immediately after entry for stop/TP.
- **Pessimistic same-bar rule:** if a bar's range hits both stop and target, count it
  as a **LOSS** (or, if entry gap, worst-case).
- Apply **costs**: configurable fee + spread + slippage per trade (sensible PAXG/BTC defaults).
- Keep `TIMEOUT` as its own bucket. Report honest stats (no √252).

### Phase 4.5 — Real-time, non-repainting signal delivery

The signal must be actionable for copy-trading: fresh in real time, but stable once fired.

- **Trigger on candle close, not a timer.** Replace the 30s `setInterval` in
  `app/api/stream/route.ts` with a recompute driven by the Binance `candle` event when
  `closed === true` on the 1m kline. A fresh signal is emitted within ~1–2s of each minute.
- **Non-repainting.** Compute indicators/signal on the last *closed* candle, not the
  in-progress candle or the live ticker price. Once a signal fires for a given candle time,
  its direction / entry / stop / target are frozen and stamped with that candle's close time.
- **Debounce/guard.** Skip re-emitting if the confirmed signal is unchanged from the last
  closed candle (prevents noise); only emit a new *actionable* signal when direction changes
  or a prior trade resolved (ties into Phase 2 de-duplication).
- **Freshness in the UI.** Show "Signal as of HH:MM:SS (candle close)", a live/stale dot
  tied to `binanceService.connected`, and seconds-since-last-update. If the socket drops or
  data is stale (>90s), show a clear **STALE — do not trade** state instead of a signal.
- **Live price vs signal price.** The card shows the live ticker for context but clearly
  separates it from the *locked signal entry* so the user knows which price to act on.
- MTF higher-timeframe pulls stay cached and refresh on their own candle closes (a 4h leg
  doesn't need refetching every minute) to keep the 1m path fast.

### Phase 5 — Simple, readable UI

- New top card = **the call**: `BUY / SELL / WAIT` + up to 3 plain-English reasons +
  entry / stop / target + honest confidence label + honest track record
  ("42 past signals like this; 24 hit target").
- Move existing advanced panels (SMC, volume profile, MTF table, regime, etc.) behind a
  single **"Show details"** toggle. Nothing deleted, just tucked away.
- Add a persistent **"Educational only — not financial advice"** footer/banner.
- Remove the AI Trading Analysis panel and its parser.

### Phase 6 — Simpler code + tests

- Remove the AI: delete `app/api/analyze/route.ts`, drop `@anthropic-ai/sdk` from
  `package.json`, remove the AI panel/parser from `page.tsx`.
- Split `app/page.tsx` (1,758 lines) into `components/` files by panel; a plain
  container that wires data → components. No "Phase 21/22" jargon in names/comments.
- Add **Vitest**. Unit-test the math: indicators (RSI/EMA/MACD/BB/ATR/Stoch),
  backtest exit logic (same-bar pessimism, off-by-one), correlation (returns),
  stats (`winRate`, `profitFactor`, `avgRR`, Sharpe), news-window edge cases.

## Data flow (after changes)

```
Binance WS/REST ─► binanceService (candles/ticker)
      │
      ▼
/api/signals ─► calculateIndicators ─► [candle modules] + [time modules] + MTF
      │                                        │
      ▼                                        ▼
   generateEnhancedSignal ──► honest confidence label
      │                                        │
      ▼                                        ▼
   signalHistory + patternDatabase ◄── storage.ts (JSON persist)
      │
      ▼
   UI: one clear call + "Show details" ── (no Claude)
```

## Testing strategy

- Vitest unit tests for all pure math functions (Phase 6, but write alongside each phase).
- Each phase: `npm test` green + manual `npm run dev` smoke check before moving on.
- Backtest: add a fixture of known candles with a hand-computed expected outcome.

## Risks / trade-offs

- Backtest rewrite is the most complex piece; MTF reconstruction via resampling is an
  approximation of live MTF (which fetches real higher-TF candles). Acceptable and documented.
- Honest metrics make the app look *less* impressive (hidden win rates, labels instead of
  fake %). That is the point.
- De-duplication may sharply reduce recorded "trades" — expected and correct.

## Rollout order

1 → 2 → 3 → 4 → 4.5 → 5 → 6. Ship/commit after each phase. UI (5) can start once 1–2 land.
