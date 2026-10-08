# System Overview — xau-analyzer

> Audit-era snapshot, 15 September 2026, at commit `56d7a4e` (main). This is the entry-point
> document for the audit documentation set. Finding IDs (SEC-n, BUG-n, Q-n, UX-n…) are
> canonical and defined in TECHNICAL_DEBT.md; the remediation plan is IMPROVEMENT_ROADMAP.md.
> Code citations are relative to the app folder `xau-analyzer/` inside this repository.

## What this is

A free, local, **educational** market-analysis app. It watches two Binance markets live and
issues one plain-English call per market — BUY, SELL, or WAIT — with a frozen entry, stop-loss,
and take-profit, then tracks its own results honestly (a timeout is never counted as a win).

Three caveats it states about itself, which remain true:

- **"Gold / XAU" is actually PAXG** (PAXGUSDT), a tokenised-gold crypto on Binance. It tracks
  spot gold but is not identical to it. "Bitcoin" is real BTC/USDT.
- **Not financial advice.** Signals can be wrong; the tool exists to teach how such signals
  are built and measured.
- **No accounts, no API keys, no cost.** All data comes from Binance's public endpoints.

One caveat the audit adds: the app's honesty promise is genuine in design but has verified
defects in execution — live win/loss accounting is optimistic relative to the backtester
(BUG-2), and parts of the signal mathematics are wrong (BUG-1, BUG-3). Treat the displayed
track record with caution until Phase 0–1 of IMPROVEMENT_ROADMAP.md lands.

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 14.2.3 (App Router) | `package.json:14`. **SEC-1 (critical):** this version carries 30+ advisories incl. a Windows-host RCE; upgrade to 14.2.35 immediately, 15.5.24+ for full closure |
| UI | React 18, single client page | `app/page.tsx` — 1,659 lines, the entire interface (Q-2) |
| Language | TypeScript, `strict: true` | `tsc --noEmit` clean; no lint script configured |
| Charts | Recharts 2.12 | eagerly imported (PERF-3) |
| Icons | lucide-react | |
| Market data | `ws` 8.x to Binance WebSocket + public REST | server-side only (`next.config.mjs` externalises `ws`) |
| Persistence | Debounced JSON files in `.data/` | no database; `lib/storage.ts` |
| Styling | Inline style objects | no CSS framework; one injected `<style>` tag (`page.tsx:1644`) |
| Tests | Vitest 2.x, 15 files, 51 tests | `lib/__tests__/` only; no coverage of routes or UI (TEST-1) |
| Auth / env | None | `.env.local.example` confirms no keys needed |

## How to run

```
npm install
npm run dev     # http://localhost:3000
npm test        # 51 unit tests (vitest run)
npm run build   # production build
```

No environment variables, no configuration. Learning state accumulates in `.data/`
(gitignored); delete the folder to reset history and adaptive weights.

Two things worth knowing before you run it:

- **SEC-1:** `next dev` on this framework version binds 0.0.0.0 on a Windows host subject to
  an unauthenticated-RCE advisory. Do not run on an untrusted network until Next is upgraded.
- **ST-2:** `npm test` and `npm run build` open a real Binance WebSocket as an import side
  effect (`lib/binanceService.ts:190`), so both need network access.

## Repository layout

The repo root holds `docs/` (this documentation) and the app in the `xau-analyzer/` subfolder:

```
xau-analyzer/
├─ app/
│  ├─ layout.tsx                 root layout (metadata still says "powered by AI" — UX-10)
│  ├─ page.tsx                   the entire UI: 5 tabs, ~40 inline components (Q-2)
│  └─ api/
│     ├─ stream/route.ts         SSE live feed + per-candle-close signal
│     ├─ signals/route.ts        on-demand signal for both assets (mutates stores — PERF-1)
│     ├─ candles/route.ts        Binance kline proxy for chart timeframes
│     ├─ backtest/route.ts       conservative historical backtest
│     └─ performance/route.ts    live track-record stats + history
├─ lib/
│  ├─ (market data)  binanceService.ts · liveSignal.ts · multiTimeframe.ts
│  ├─ (signal maths) signalEngine.ts · technicalAnalysis.ts · volumeAnalysis.ts ·
│  │                 marketStructure.ts · smartMoney.ts · patternRecognition.ts ·
│  │                 marketRegime.ts · volatilityRegime.ts · sessionAnalysis.ts ·
│  │                 newsRisk.ts · correlationAnalysis.ts · volumeProfile.ts ·
│  │                 riskManagement.ts · confidenceModel.ts · monteCarlo.ts (dead — Q-7)
│  ├─ (learning)     patternDatabase.ts · signalHistory.ts · confidenceCalibration.ts ·
│  │                 storage.ts
│  ├─ (backtest)     backtesting.ts · backtestEngine.ts
│  ├─ types.ts                   canonical shared types (widely shadow-copied — Q-3)
│  └─ __tests__/                 15 Vitest files, 51 tests
├─ next.config.mjs · vitest.config.ts · tsconfig.json · package.json
├─ .env.local.example            two-line stub: no keys needed
└─ README-signals.md             plain-language explanation of the signals
```

`.data/` (created at runtime, gitignored) holds `signalHistory.json` and `patternDatabase.json`.

## Architecture at a glance

One server-side singleton owns the Binance connection; everything else reads from it.

```
        Binance  (wss://stream.binance.com + public REST)
           │  combined 1m kline + miniTicker streams for BTCUSDT & PAXGUSDT;
           │  REST: 200-candle backfill, 5m/15m/1h/4h for MTF, backtest history
           ▼
   BinanceService — server singleton on global._binanceSvc  (lib/binanceService.ts)
   in-memory candles (300 cap) + latest tickers; EventEmitter; auto-reconnect 5s
           │  events: candle / ticker / history / connected
           ▼
   Next.js API routes (app/api/)
   ├─ GET /api/stream ── SSE ──────────────────────────────► browser
   │    on each CLOSED 1m candle: computeSignalForAsset      app/page.tsx
   │    (lib/liveSignal.ts) → generateEnhancedSignal         single client page,
   │    (lib/signalEngine.ts) → frozen entry/stop/target;    EventSource + fetch,
   │    resolves & records trades in both stores ──┐         5 tabs
   ├─ GET /api/signals ──── same compute, on demand │  ◄──── 30s fallback poll
   ├─ GET /api/candles ──── kline proxy (chart tab) │
   ├─ GET /api/backtest ─── runs same engine on     │
   │                        historical bars         ▼
   └─ GET /api/performance ◄── signalHistory + patternDatabase stores
                               (debounced 500ms writes → .data/*.json)
```

Design intent: signals are **non-repainting** — computed only on the last *closed* 1-minute
candle, then frozen. Outcomes resolve as WIN (target hit), LOSS (stop hit), or TIMEOUT
(60 minutes, never counted as a win). The stores feed adaptive indicator weights and a
similarity-matched "win rate of similar past signals" back into the engine.

Known architectural defects (see TECHNICAL_DEBT.md for full detail): each SSE client and each
poll recomputes the signal independently, firing its own uncached REST calls, and
`GET /api/signals` mutates the learning stores (PERF-1); trade resolution only runs when a
visitor triggers compute, so unwatched trades resolve late at stale prices (part of BUG-2);
writes to `.data/` are non-atomic with no shutdown flush (ST-1).

## The five tabs

All rendered from `app/page.tsx` (`activeTab`, `page.tsx:1260`).

| Tab | What it shows | Known issues |
|---|---|---|
| **Market** (`page.tsx:1395`) | TradeCallCard — the plain-English BUY/SELL/WAIT headline with frozen entry/stop/target and a STALE warning — plus per-asset price cards, mini charts, and indicator rows | Three conflicting verdict surfaces (UX-1); the smaller SignalCard runs the *legacy* engine and can disagree with TradeCallCard (Q-1); fabricated "active window" timing widget (UX-2) |
| **Signals** (`page.tsx:1431`) | Multi-timeframe confluence (5m/15m/1h/4h), market structure, volume, volatility, trade quality, and component score breakdown — both assets side by side | MTF scores still-forming higher-TF candles (BUG-8) |
| **Intelligence** (`page.tsx:1488`) | Institutional panels for the selected asset: market regime, session, news risk, chart patterns, smart-money (FVGs/order blocks), volume profile, BTC↔XAU correlation, ML probability, adaptive weights, STRONG-gate status | ML probability pools both assets' history (BUG-7) |
| **Probability** (`page.tsx:1534`) | A client-side statistical model: live 1m feed, expected-move probabilities, and a "likely 24h price range" distribution chart | Computed in the browser, not by the signal engine; its "RSI" is an approximation (UX-2) |
| **Performance** (`page.tsx:1617`) | Live track record (win rate, profit factor, expectancy, drawdown, timeouts reported separately) and an on-demand backtest (charges 0.15% costs per trade; both-touch bars booked as LOSS) | Live resolution is more optimistic than the backtest (BUG-2); backtest diverges from live in four undisclosed ways (BUG-9); zero-history state shows alarming fake metrics (UX-5) |

## Current health

Verified during the audit, on this machine:

| Check | Result |
|---|---|
| `npm test` (`vitest run`) | 51/51 pass |
| `tsc --noEmit` | clean |
| `next build` | succeeds; 207 kB gzipped first-load JS |
| `npm audit` | **critical** — Next.js 14.2.3 (SEC-1); dev-only vitest advisories (SEC-3) |

The audit confirmed **22 findings** through adversarial verification, catalogued in
TECHNICAL_DEBT.md. The four P0 items:

| ID | Severity | Summary |
|---|---|---|
| SEC-1 | Critical | Next.js 14.2.3: 30+ advisories incl. unauthenticated RCE on Windows dev hosts. Fix: `npm install next@14.2.35` now; Next 15.5.24+ to fully close |
| BUG-1 | High | MACD "crossover" condition is a tautology — MACD always contributes its full ±25 score, and the crossover reason shown to the user is false (`signalEngine.ts:124`, `technicalAnalysis.ts:131`) |
| BUG-2 | High | Live WIN/LOSS resolution is optimistic vs the backtester: close-only checks miss wick stop-outs, exits at close not at the level, no costs, visitor-driven timing (`signalHistory.ts:104`, `patternDatabase.ts:148`) |
| BUG-3 | High | Confidence's multi-timeframe bonus is direction-blind — every SELL's confidence is systematically inverted, up to a 40-point swing (`confidenceModel.ts:27`) |

The recommended single next step (canonical): upgrade Next.js (SEC-1), then fix the
signal-maths trio BUG-1 + BUG-3 + BUG-4 with regression tests, then BUG-2. The full phased
plan is in IMPROVEMENT_ROADMAP.md.

## Documentation index

| Document | What it covers |
|---|---|
| `docs/SYSTEM_OVERVIEW.md` | This file — what the app is, how it fits together, where to start |
| `docs/TECHNICAL_DEBT.md` | Canonical findings register: every confirmed defect with ID, severity, evidence, and effort |
| `docs/IMPROVEMENT_ROADMAP.md` | Phased remediation plan (Phase 0 stabilisation through Phase 5 optional work) |
| `docs/CHANGELOG.md` | Project history reconstructed from git during the audit |
| `xau-analyzer/README-signals.md` | Pre-audit plain-language explainer of the signal semantics — honest and mostly accurate, though its "backtest runs the same engine" claim overstates (BUG-9) |
| `docs/superpowers/` | Historical spec and implementation plans from the August 2026 trust-improvements build; kept as a record, not current documentation |
