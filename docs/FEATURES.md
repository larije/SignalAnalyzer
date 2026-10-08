# Feature Inventory

Audit-era snapshot (2026-09-15). Every feature actually present in the app, its implementing
files, and its honest status. Finding IDs (SEC-, BUG-, Q-, ST-, PERF-, UX-, A11Y-) are canonical —
see TECHNICAL_DEBT.md and KNOWN_ISSUES.md for detail, and ARCHITECTURE.md for how the pieces
connect. Paths are relative to the `xau-analyzer/` app folder.

Status vocabulary: **Fully implemented** · **Implemented with verified defects** (IDs listed) ·
**Partially implemented** · **Deprecated-but-live** · **Dead code**.

## Inventory

| Feature | Module/Files | Status | Notes |
|---|---|---|---|
| Live prices & candles over SSE | `lib/binanceService.ts`, `app/api/stream/route.ts`, `useMarketData` at `app/page.tsx:192` | Implemented with verified defects (BUG-5, PERF-1, ST-2, ST-3, UX-3) | One server-side Binance WebSocket (BTCUSDT + PAXGUSDT labelled "XAU"), fanned out per browser tab. Staleness clock misreads candle open time as close time (BUG-5); no client-side watchdog if the stream dies (UX-3). |
| Non-repainting 1m signal | `lib/liveSignal.ts`, `lib/signalEngine.ts:96-330` | Implemented with verified defects (BUG-1, BUG-3, BUG-6, BUG-8) | Computed only on CLOSED 1m candles with frozen entry/stop/target — the non-repainting promise itself holds. The scoring maths has confirmed bugs (MACD tautology, direction-blind MTF confidence, forming higher-TF bars). |
| TradeCallCard plain-English verdict | `app/page.tsx:1124-1233` | Implemented with verified defects (UX-1) | Single BUY / SELL / WAIT headline with locked levels, "Why" list, stale-data refusal and an honest track-record sentence. Good in isolation, but two other verdict surfaces contradict it on the same screen (UX-1). |
| Legacy SignalCard signal | `generateSignal` at `lib/signalEngine.ts:28`, `app/page.tsx:673-757` | Deprecated-but-live (Q-1; also BUG-1, UX-1, UX-2) | The old engine (thresholds ±55/±20, no gate, flat ATR stops) still renders as a full card below TradeCallCard and drives the "TRADE ACTION" widget — the two can say BUY and WAIT simultaneously. |
| Entry/stop/target with click-to-copy | `lib/riskManagement.ts:17-57`, `CopyPriceCell` at `app/page.tsx:344-367` | Implemented with verified defects (A11Y-2, BUG-12) | ATR- and structure-aware stops/targets plus wide secondary levels. Copy control is a click-only div, keyboard-unreachable (A11Y-2); the EXCELLENT/GOOD/POOR quality label uses a hard-coded win probability, not measured outcomes (BUG-12). |
| Confidence label + 30-sample numeric gate | `lib/confidenceModel.ts`, `app/page.tsx:1157-1158` | Implemented with verified defects (BUG-3, UX-4) | Strong/Medium/Weak words only, until 30 signals have resolved. The underlying number is systematically wrong for shorts (BUG-3), and three other surfaces leak the raw percentage regardless (UX-4). |
| Signal history WIN/LOSS/TIMEOUT tracking | `lib/signalHistory.ts`, `lib/patternDatabase.ts`, `lib/storage.ts` | Implemented with verified defects (BUG-2, BUG-6, Q-4, ST-1) | Timeouts never count as wins — the core honesty rule is real and tested. But live resolution checks only 1m closes (wick stop-outs invisible), charges no costs, and runs only when someone is watching (BUG-2). |
| Performance stats panel | `PerformancePanel` at `app/page.tsx:611-638`, `app/api/performance/route.ts` | Implemented with verified defects (UX-5; data inherits BUG-2) | Win rate, profit factor, expectancy, Sharpe, max drawdown from the live history. Zero-history state renders an alarming red "0.0%" grid (UX-5). |
| Adaptive indicator weights (15-sample gate) | `getAdaptiveWeights` at `lib/patternDatabase.ts:254-300`, applied `lib/signalEngine.ts:199-208`, panel `app/page.tsx:1052-1091` | Implemented with verified defects (inherits BUG-2; UX-10) | Per-asset weights (0.5-1.5×) on the first 8 score components once ≥15 trades have resolved. Learns from BUG-2's optimistic outcomes; panel title leaks "PHASE 22" (UX-10). |
| ML probability panel (20-sample gate) | `getMLProbability` at `lib/patternDatabase.ts:174-251`, panel `app/page.tsx:1017-1050` | Implemented with verified defects (BUG-7) | Similarity-weighted win rate of past signals sharing pattern/regime/structure features. Pools BTC and PAXG history with no asset filter, so the 20-sample gate can be satisfied by the other asset (BUG-7). |
| Confidence calibration | `lib/confidenceCalibration.ts`, fed via `lib/signalHistory.ts:116-121` | Partially implemented (Q-6) | Buckets are written in production and the write path is tested, but `realizedWinRate`/`showNumericConfidence` are read only by tests — no route or UI consumes them; the UI re-implements the gate with drifted semantics. |
| Multi-timeframe confluence | `lib/multiTimeframe.ts`, panel `app/page.tsx:417-454` | Implemented with verified defects (BUG-1, BUG-8, PERF-1) | 5m/15m/1h/4h fetched from Binance REST per compute; aggregate ±25 score plus alignment %. MACD component is the tautology bug at ±20 (BUG-1); still-forming higher-TF candles are scored (BUG-8); fetches are uncached per client (PERF-1). |
| Market structure (HH/HL, BOS, CHoCH) | `lib/marketStructure.ts`, panel `app/page.tsx:483-508` | Fully implemented | 3-bar pivot detection; ±20 score plus BOS/CHoCH adjustments. Bounds-tested in `lib/__tests__/coverage.test.ts`. |
| Volume analysis | `lib/volumeAnalysis.ts`, panel `app/page.tsx:457-480` | Fully implemented | Ratio vs 20-bar average (current bar excluded), spike detection, ±15 score. Tested. |
| Volatility regime | `lib/volatilityRegime.ts`, badge `app/page.tsx:511-533` | Fully implemented | BB-width + ATR% → LOW/NORMAL/HIGH/EXTREME driving stop/TP multipliers and a confidence adjustment. |
| Session analysis | `lib/sessionAnalysis.ts`, panel `app/page.tsx:887-906` | Implemented with verified defects (BUG-13) | UTC-hour session classification with confidence adjustments. Boundaries are fixed UTC, so London/NY are off by 1h during DST; "session" high/low are actually last-120-min extremes. |
| News-risk windows | `lib/newsRisk.ts`, panel `app/page.tsx:908-923` | Implemented with verified defects (BUG-14) | Time-pattern estimate (honestly flagged `isEstimate`), not a live calendar; EXTREME vetoes to NO_TRADE. Some windows are misaligned, and weekends always read HIGH — blocking STRONG on 24/7 BTC every weekend. |
| Chart pattern recognition | `lib/patternRecognition.ts`, panel `app/page.tsx:925-951` | Fully implemented | 13 patterns from pivots + regression slopes, priority-ranked; feeds ±10 score and the STRONG gate. No unit tests (TEST-1). |
| Smart-money concepts (FVG/OB/liquidity) | `lib/smartMoney.ts`, panel `app/page.tsx:953-972` | Fully implemented | Fair-value gaps, order blocks, equal-high/low pools; ±15 score. No unit tests (TEST-1). |
| Volume profile (POC/VAH/VAL) | `lib/volumeProfile.ts`, panel `app/page.tsx:974-993` | Fully implemented | 30-bin profile, display-only — contributes no score to the signal by design. |
| Cross-asset correlation | `lib/correlationAnalysis.ts`, panel `app/page.tsx:995-1015` | Implemented with verified defects (BUG-10) | Pearson on log-returns, ±10 score. Series are paired by array index rather than timestamp, so desync silently degrades the component toward 0. |
| Market regime detection + multiplier | `lib/marketRegime.ts`, panel `app/page.tsx:859-885` | Implemented with verified defects (BUG-4) | TRENDING/RANGING/COMPRESSION/EXPANSION/REVERSAL classification with a multiplicative score adjustment. Shares the asymmetric bear-side MTF arithmetic (BUG-4 at `lib/marketRegime.ts:76`). |
| STRONG-signal 6-condition gate | `lib/signalEngine.ts:241-279`, panel `app/page.tsx:1093-1110` | Implemented with verified defects (BUG-4) | STRONG_BUY/SELL only if all 6 criteria pass, else downgraded. Bear-side MTF check counts HOLD timeframes as bearish — 1 SELL + 4 HOLD passes; the bull mirror fails. |
| Backtester with costs | `lib/backtestEngine.ts`, `lib/backtesting.ts`, `app/api/backtest/route.ts`, panel `app/page.tsx:641-669` | Implemented with verified defects (BUG-9, BUG-11, SEC-2, PERF-4, UX-6) | Genuinely conservative bar simulator: intrabar stop/TP, both-touch = LOSS, 0.15% round-trip costs. But it diverges from live tracking on four undisclosed axes (BUG-9), and failures render as a silent blank panel (UX-6). |
| Chart timeframe switching | TF pills `app/page.tsx:1367-1381`, fetch `app/page.tsx:1271-1282`, `app/api/candles/route.ts`, `MiniChart` at `app/page.tsx:782-808` | Fully implemented | 1M/15M/1H/4H/1D pills on the Market tab (there is no separate chart tab); non-1m candles proxied through `/api/candles`. Axes hidden and signal levels never drawn (UX-7); TF fetch errors swallowed (UX-9). |
| Probability tab (client-side statistical model) | `computeAnalysis` at `app/page.tsx:127-154`, tab `app/page.tsx:1534-1612` | Implemented with verified defects (UX-2, UX-8) | Normal-distribution 24h price range with per-zone probabilities, honestly captioned "rough model". Its "RSI" divides by a hard-coded 14 rather than computing real RSI (UX-2), and the "you are here" marker almost never renders (UX-8). |
| Monte Carlo simulation | `lib/monteCarlo.ts` | Dead code (Q-7, BUG-15) | `runMonteCarlo` has zero importers anywhere in the codebase. Would also double-apply the Itô correction if revived (BUG-15). Delete per Q-7. |

## Honesty gates at a glance

Three separate minimum-sample gates suppress numbers until the track record can justify them.
They are real, but each is hard-coded in a different layer (Q-5) and one is cross-contaminated:

| Gate | Threshold | Where enforced | Caveat |
|---|---|---|---|
| Numeric confidence % | 30 completed signals | UI only, `app/page.tsx:1158` | Counts TIMEOUTs; the unused calibration module counts decided only (Q-6) |
| ML probability panel | 20 similar samples | UI only, `app/page.tsx:1020` | Sample pool mixes BTC and PAXG (BUG-7) |
| Adaptive weights | 15 decided trades | Engine, `lib/patternDatabase.ts:82` | Per-asset (correctly filtered); learns from BUG-2's optimistic outcomes |

## How the non-obvious features actually work

### Live data pipeline (SSE)
A module-level singleton (`lib/binanceService.ts:177-190`) opens one combined WebSocket to
Binance for both symbols' 1m klines and mini-tickers, backfills 200 candles over REST, and caps
memory at 300 candles per symbol. `/api/stream` re-emits these as newline-delimited JSON SSE
events (`init`, `candle`, `ticker`, `history`, `signal`, `freshness`). Note the singleton
connects at module import, so `next build` and `vitest run` open real Binance connections
(ST-2), and each connected browser tab independently recomputes the signal on every candle
close (PERF-1).

### Non-repainting 1m signal
`computeSignalForAsset` (`lib/liveSignal.ts`) drops the still-forming candle, runs
`generateEnhancedSignal` on closed data only, and freezes entry/stop/target at that candle's
close — a signal never changes after it fires. Eleven additive components (RSI ±30, MACD ±25,
BB ±20, EMA ±15, Stoch ±10, volume ±15, structure ±20, MTF ±25, smart-money ±15, pattern ±10,
correlation ±10) are summed, regime-multiplied, and clamped to ±100
(`lib/signalEngine.ts:96-233`). The MACD component is currently a tautology that always
contributes the full ±25 (BUG-1).

### TradeCallCard vs legacy SignalCard (the two-verdict problem)
TradeCallCard maps the enhanced signal to one word — BUY, SELL or WAIT — refuses to render
levels when data is stale, and states the measured track record in a sentence
(`app/page.tsx:1152-1174`). Directly beneath it, SignalCard renders the *legacy* engine's
verdict with its own thresholds, its own levels, and a "timing" widget whose minute figures are
derived from RSI × magic constants with no backing model (UX-2). Until Q-1/UX-1 land,
TradeCallCard is the surface to trust.

### Outcome tracking and the learning loop
Every actionable signal is written to two stores: `signalHistory` (stats + calibration) and
`patternDatabase` (feature vectors for ML/weights) — a duplicated lifecycle (Q-4). Resolution
rules: TP hit = WIN, stop hit = LOSS, 60 minutes without either = TIMEOUT, and timeouts are
excluded from the win rate (`lib/signalHistory.ts:94-150`). The verified caveat is BUG-2:
resolution checks only candle closes (wicks through the stop are invisible), records exits at
the close rather than the level, charges no costs, and only runs when a client triggers
compute — so live stats are systematically kinder than the backtester, and everything
downstream (adaptive weights, ML probability, calibration) learns from that kinder data.

### Adaptive weights and ML probability
After 15 resolved trades for an asset, each of the 8 core components gets a weight of
`1.0 + (componentWinRate − baseWinRate) × 2`, clamped 0.5-1.5, applied inside the engine
(`lib/patternDatabase.ts:254-300`, `lib/signalEngine.ts:199-208`). Separately,
`getMLProbability` scores each past decided trade for similarity (pattern +4, regime +3,
direction +2, …) and reports a similarity-weighted win rate, hidden in the UI until 20 samples
(`app/page.tsx:1020`). The weights query filters by asset; the ML query does not (BUG-7).

### Confidence calibration (backend-only)
`CalibrationStore` groups resolved outcomes into 10-point confidence buckets and can answer
"when we said 70%, what actually happened?" — but only tests ever ask
(`lib/confidenceCalibration.ts`, Q-6). The UI's 30-sample numeric gate (`app/page.tsx:1158`)
re-implements the idea from `/api/performance` stats with drifted counting: it includes
TIMEOUTs, whereas the module counts decided outcomes only.

### Backtester
`runBacktest` pages Binance klines (cap 5000 bars, BUG-11), replays a 250-bar window through
the real `generateEnhancedSignal`, enters at signal close, and evaluates exits from the next
bar using intrabar highs/lows with both-touch pessimistically scored as a LOSS at the stop;
0.15% round-trip costs are always subtracted (`lib/backtestEngine.ts:43-58`,
`lib/backtesting.ts:137-252`). It is honest about costs but not about parity with live
tracking: no adaptive weights, resampled (not real) higher timeframes, a neutral correlation
stub, and a 24-hour timeout vs the live 60-minute one (BUG-9). The route also blocks the event
loop for the duration of a run (SEC-2). The shipped UI runs it at a fixed 1h interval
(`app/page.tsx:1304`).

### STRONG-signal gate
A raw score past ±65 is only allowed to display as STRONG_BUY/STRONG_SELL if all six
conditions hold — directional MTF alignment ≥80%, pattern confidence ≥75 (or no pattern),
confirming structure, directional volume, non-opposing smart-money bias, and acceptable news
risk — otherwise it is downgraded to plain BUY/SELL (`lib/signalEngine.ts:241-279`). EXTREME
news risk overrides everything to NO_TRADE. `GateStatusPanel` (`app/page.tsx:1093-1110`) lists
exactly which criteria failed.

### Probability tab
Entirely client-side: `computeAnalysis` (`app/page.tsx:127-154`) estimates recent volatility
from the last 60 1m closes, scales it with a √390 trading-minutes convention (an equities
assumption applied to 24/7 crypto), and renders a 50-bucket normal density as the "Likely 24h
price range · rough model". Its momentum input is labelled RSI but is not RSI (UX-2), and the
current-price reference line requires an exact category match it almost never gets (UX-8).
Treat it as a sketch, not a forecast.

## Deliberate non-features (scope notes)

For completeness, the following are absent by design rather than defect: no authentication and
no database (debounced JSON files in `.data/`, `lib/storage.ts`) — it is a local, single-user
educational tool; no API keys of any kind (`.env.local.example`); no paid data — "XAU" is the
PAXG tokenized-gold proxy, disclosed in the footer (`app/page.tsx:1236-1245`); and no
deployment story (no Dockerfile, CI, or hosting config). Mobile support is effectively absent
(A11Y-5, Mobile scored 1/10) — that one is a gap, not a choice.
