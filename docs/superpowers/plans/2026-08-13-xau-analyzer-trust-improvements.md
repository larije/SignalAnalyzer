# XAU/BTC Analyzer — Trust & Simplicity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app's signals trustworthy, honest, real-time/non-repainting, and simple — with no paid feeds and no Claude AI.

**Architecture:** Keep the deterministic Binance-fed engine. Fix the math, redefine "win" honestly, persist state to a local JSON file, drive signals off 1-minute candle *closes* (non-repainting), rewrite the backtest to test the real engine with costs, simplify the UI to one clear call, and add Vitest tests.

**Tech Stack:** Next.js 14 (App Router), TypeScript, React 18, Recharts, `ws`. Adding: Vitest. Removing: `@anthropic-ai/sdk`.

## Global Constraints

- Node/Next: existing `next@14.2.3`, React 18. Do not upgrade framework versions.
- No new runtime paid services or API keys. Binance public REST/WS only.
- "Gold" data is `PAXGUSDT`; label it **PAXG** in all user-facing copy.
- All money/percent stats must be either correct or labeled an estimate.
- Persistence path: `xau-analyzer/.data/*.json` (gitignored). No database.
- Every phase ends green: `npm test` passes and `npm run build` compiles.
- Commit after each task. Conventional-ish messages, end with the Co-Authored-By trailer.

---

## Phase 0: Test harness setup

### Task 0.1: Add Vitest

**Files:**
- Modify: `xau-analyzer/package.json`
- Create: `xau-analyzer/vitest.config.ts`
- Create: `xau-analyzer/lib/__tests__/smoke.test.ts`

- [ ] **Step 1:** Add dev deps + script. In `package.json` add to `devDependencies`: `"vitest": "^2.1.0"`. Add script: `"test": "vitest run"`, `"test:watch": "vitest"`.
- [ ] **Step 2:** Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['lib/**/*.test.ts'] } });
```
- [ ] **Step 3:** Create smoke test `lib/__tests__/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
describe('smoke', () => { it('runs', () => { expect(1 + 1).toBe(2); }); });
```
- [ ] **Step 4:** Run `cd xau-analyzer && npm install && npm test` → PASS.
- [ ] **Step 5:** Commit `chore: add vitest test harness`.

---

## Phase 1: Fix the broken math

### Task 1.1: Fix `avgRR` divide-by-zero in signal history

**Files:**
- Modify: `xau-analyzer/lib/signalHistory.ts:97-99`
- Test: `xau-analyzer/lib/__tests__/stats.test.ts`

**Interfaces:**
- Produces: `computeAvgRR(wins: {pnlPct:number}[], losses: {pnlPct:number}[]): number` (exported helper) — avg winning % divided by avg losing %; `0` when no losses or no wins.

- [ ] **Step 1: Failing test** `stats.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { computeAvgRR } from '../signalHistory';
describe('computeAvgRR', () => {
  it('is avg win / avg loss magnitude', () => {
    expect(computeAvgRR([{pnlPct:2},{pnlPct:4}], [{pnlPct:-1},{pnlPct:-3}])).toBeCloseTo(1.5, 5);
  });
  it('is 0 when no losses', () => { expect(computeAvgRR([{pnlPct:2}], [])).toBe(0); });
  it('is finite always', () => { expect(Number.isFinite(computeAvgRR([{pnlPct:1}], [{pnlPct:-1}]))).toBe(true); });
});
```
- [ ] **Step 2:** Run → FAIL (`computeAvgRR` not exported).
- [ ] **Step 3:** Export `computeAvgRR` and use it in `getStats`. Replace the broken lines 97-99:
```ts
export function computeAvgRR(wins: {pnlPct:number}[], losses: {pnlPct:number}[]): number {
  if (wins.length === 0 || losses.length === 0) return 0;
  const avgWin  = wins.reduce((s, w) => s + Math.abs(w.pnlPct), 0) / wins.length;
  const avgLoss = losses.reduce((s, l) => s + Math.abs(l.pnlPct), 0) / losses.length;
  return avgLoss > 0 ? +(avgWin / avgLoss).toFixed(2) : 0;
}
```
In `getStats`, compute `const avgRR = computeAvgRR(wins.map(e=>({pnlPct:e.pnlPct??0})), losses.map(e=>({pnlPct:e.pnlPct??0})));`
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `fix: avgRR divide-by-zero (was always Infinity)`.

### Task 1.2: Remove bogus √252 Sharpe

**Files:**
- Modify: `xau-analyzer/lib/signalHistory.ts` (Sharpe already un-annualized here — verify), `xau-analyzer/lib/backtesting.ts:187`
- Test: `xau-analyzer/lib/__tests__/stats.test.ts`

**Interfaces:**
- Produces: `perTradeSharpe(pnls: number[]): number` — mean/stddev of per-trade %; `0` if <2 samples or stddev 0. No annualization.

- [ ] **Step 1: Failing test** (append to `stats.test.ts`):
```ts
import { perTradeSharpe } from '../signalHistory';
it('perTradeSharpe = mean/std, no annualization', () => {
  const s = perTradeSharpe([1, -1, 1, -1]); // mean 0 -> 0
  expect(s).toBe(0);
  expect(perTradeSharpe([2,2,2])).toBe(0); // zero variance -> 0
});
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Add & export `perTradeSharpe` in `signalHistory.ts`; use it in `getStats`. In `backtesting.ts`, replace the `* Math.sqrt(252)` line with `perTradeSharpe(pnls)` (import it). Label the UI field "Sharpe (per trade)".
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `fix: honest per-trade Sharpe (drop bogus 252 annualization)`.

### Task 1.3: Correlation on returns, not price levels

**Files:**
- Modify: `xau-analyzer/lib/correlationAnalysis.ts`
- Test: `xau-analyzer/lib/__tests__/correlation.test.ts`

**Interfaces:**
- Produces: `pearsonReturns(a: number[], b: number[]): number` — converts each price series to log returns, then Pearson; `0` if <10 overlapping returns.

- [ ] **Step 1: Failing test** `correlation.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { pearsonReturns } from '../correlationAnalysis';
describe('pearsonReturns', () => {
  it('perfectly correlated moves -> ~1', () => {
    const a = [100,101,102,103,104,105,106,107,108,109,110];
    const b = a.map(x => x * 2);
    expect(pearsonReturns(a, b)).toBeGreaterThan(0.99);
  });
  it('opposite moves -> ~ -1', () => {
    const a = [100,101,102,101,102,103,102,103,104,103,104];
    const b = a.map((_,i,arr) => 200 - arr[i]);
    expect(pearsonReturns(a, b)).toBeLessThan(-0.9);
  });
  it('too few points -> 0', () => { expect(pearsonReturns([1,2],[2,3])).toBe(0); });
});
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `pearsonReturns` (log-returns then existing pearson math). In `analyzeCorrelations`, use `pearsonReturns(btcPrices, xauPrices)` and widen `minLen` cap from 50 to 200. In `summary`, change label to "BTC/PAXG return correlation". Mark the DXY/US10Y/Nasdaq/ETH notes explicitly as `(reference only — no live data)`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `fix: correlation uses returns not price levels; label PAXG + reference-only notes`.

### Task 1.4: EMA200 honesty + PAXG labels

**Files:**
- Modify: `xau-analyzer/lib/technicalAnalysis.ts` (Indicators.ema200 → `number | null`; only real EMA200)
- Modify: consumers that read `ema200` (`lib/signalEngine.ts:147`, `app/page.tsx`)
- Test: `xau-analyzer/lib/__tests__/indicators.test.ts`

**Interfaces:**
- Produces: `Indicators.ema200: number | null` — `null` when `< 200` candles. Consumers must null-check; when null, skip the EMA200 tilt and do not display "EMA200".

- [ ] **Step 1: Failing test** `indicators.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { calculateIndicators, Candle } from '../technicalAnalysis';
function mk(n: number): Candle[] {
  return Array.from({length:n}, (_,i) => ({ time:i, open:100+i*0.1, high:100+i*0.1+0.2, low:100+i*0.1-0.2, close:100+i*0.1, volume:10 }));
}
describe('ema200 honesty', () => {
  it('null when < 200 candles', () => { expect(calculateIndicators(mk(120))!.ema200).toBeNull(); });
  it('number when >= 200 candles', () => { expect(typeof calculateIndicators(mk(220))!.ema200).toBe('number'); });
});
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Change type to `ema200: number | null`. Compute `const ema200v = closes.length >= 200 ? calcEMA(closes, 200) : null;` and return `ema200: ema200v ? ema200v[ema200v.length-1] : null`. In `signalEngine.ts:147-148`, guard: `if (ind.ema200 !== null) { if (price > ind.ema200) emaScore = Math.min(15, emaScore+3); else emaScore = Math.max(-15, emaScore-3); }`.
- [ ] **Step 4:** Run → PASS + `npm run build` (fix any consumer type errors, e.g. page.tsx EMA200 display shows "n/a" when null).
- [ ] **Step 5:** Commit `fix: expose EMA200 only when real (else null); honest labels`.

### Task 1.5: News risk = clearly an estimate + DST-tolerant

**Files:**
- Modify: `xau-analyzer/lib/newsRisk.ts`
- Test: `xau-analyzer/lib/__tests__/newsRisk.test.ts`

**Interfaces:**
- Produces: `assessNewsRiskAt(now: Date): NewsRiskAssessment`; `assessNewsRisk()` = `assessNewsRiskAt(new Date())`. NFP/CPI windows accept both 12:xx and 13:xx UTC (covers DST). Add field `isEstimate: true` to the assessment and to `NewsRiskAssessment` type; UI copy says "time-based estimate, not a live calendar".

- [ ] **Step 1: Failing test** `newsRisk.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { assessNewsRiskAt } from '../newsRisk';
describe('assessNewsRiskAt', () => {
  it('is deterministic for a given time', () => {
    const d = new Date(Date.UTC(2026, 0, 7, 3, 0)); // Wed 03:00 UTC, quiet
    expect(assessNewsRiskAt(d).riskLevel).toBe('LOW');
    expect(assessNewsRiskAt(d).isEstimate).toBe(true);
  });
  it('flags weekend', () => {
    const sat = new Date(Date.UTC(2026, 0, 10, 12, 0));
    expect(assessNewsRiskAt(sat).upcomingEvents.join()).toMatch(/Weekend/);
  });
});
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Refactor to `assessNewsRiskAt(now)`, take `h/m/dow/dom` from `now`. Change NFP/CPI/PPI `check` predicates to accept `(h === 12 || h === 13)` where they hardcoded `h === 12`. Add `isEstimate: true`. Add `isEstimate: boolean` to the `NewsRiskAssessment` interface in both `newsRisk.ts` and `types.ts`.
- [ ] **Step 4:** Run → PASS + build.
- [ ] **Step 5:** Commit `fix: news risk is timestamp-driven, DST-tolerant, labeled estimate`.

---

## Phase 2: Honest metrics

### Task 2.1: Add TIMEOUT outcome + honest win definition (signal history)

**Files:**
- Modify: `xau-analyzer/lib/types.ts` (`SignalHistoryEntry.outcome` add `'TIMEOUT'`; `PerformanceStats` add `timeouts: number`)
- Modify: `xau-analyzer/lib/signalHistory.ts` (`resolvePending`, `getStats`)
- Test: `xau-analyzer/lib/__tests__/signalHistory.test.ts`

**Interfaces:**
- Produces: resolution rule — `WIN` only if take-profit was reached; `LOSS` only if stop reached; otherwise on 60-min age → `TIMEOUT`. `winRate = wins / (wins + losses)` (timeouts excluded from win rate but reported separately).

- [ ] **Step 1: Failing test** `signalHistory.test.ts` — build a store, record a BUY, feed prices, assert:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { SignalHistoryStore } from '../signalHistory';
let s: SignalHistoryStore;
beforeEach(() => { s = new SignalHistoryStore(); });
it('WIN only when TP reached', () => {
  s.record('BTC','BUY',30,60, 100, 98, 104);
  s.resolvePending('BTC', 104, 1_000);      // TP hit
  expect(s.getHistory('BTC')[0].outcome).toBe('WIN');
});
it('drift with no TP/SL after 60m is TIMEOUT not WIN', () => {
  s.record('BTC','BUY',30,60, 100, 98, 104);
  s.resolvePending('BTC', 100.01, 61*60_000); // aged out, tiny drift
  expect(s.getHistory('BTC')[0].outcome).toBe('TIMEOUT');
});
it('winRate excludes timeouts', () => {
  s.record('BTC','BUY',30,60, 100, 98, 104); s.resolvePending('BTC',104,1000);          // WIN
  s.record('BTC','BUY',30,60, 100, 98, 104); s.resolvePending('BTC',98,1000);            // LOSS
  s.record('BTC','BUY',30,60, 100, 98, 104); s.resolvePending('BTC',100.01,61*60_000);   // TIMEOUT
  expect(s.getStats('BTC').winRate).toBeCloseTo(0.5, 5);
  expect(s.getStats('BTC').timeouts).toBe(1);
});
```
- [ ] **Step 2:** Export the class as `SignalHistoryStore` (named export alongside the singleton). Run → FAIL.
- [ ] **Step 3:** Implement: in `resolvePending`, set `outcome = tpHit ? 'WIN' : stopHit ? 'LOSS' : 'TIMEOUT'` (drop the `pnlPct>0 ? WIN : LOSS` fallback). In `getStats`, `completed = wins+losses+timeouts`, `winRate = wins/(wins+losses||1)` guarded, add `timeouts` count. Add `'TIMEOUT'` to the type and `timeouts` to `PerformanceStats`.
- [ ] **Step 4:** Run → PASS + build.
- [ ] **Step 5:** Commit `feat: honest win definition + TIMEOUT bucket in signal history`.

### Task 2.2: De-duplicate recording (one record per setup)

**Files:**
- Modify: `xau-analyzer/lib/signalHistory.ts` (`record` guard), `xau-analyzer/lib/patternDatabase.ts` (`record` guard)
- Test: `xau-analyzer/lib/__tests__/signalHistory.test.ts`

**Interfaces:**
- Produces: `record(...)` skips if an unresolved (`PENDING`) entry for the same `asset` **and same signal direction** already exists. New record allowed only after the prior one resolves or direction flips.

- [ ] **Step 1: Failing test** (append):
```ts
it('does not double-record the same open setup', () => {
  s.record('BTC','BUY',30,60,100,98,104);
  s.record('BTC','BUY',30,60,100,98,104); // duplicate while first still PENDING
  expect(s.getHistory('BTC').length).toBe(1);
});
it('records again after direction flip', () => {
  s.record('BTC','BUY',30,60,100,98,104);
  s.record('BTC','SELL',-30,60,100,102,96);
  expect(s.getHistory('BTC').length).toBe(2);
});
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** In `record`, before pushing: `if (this.entries.some(e => e.asset===asset && e.outcome==='PENDING' && sameDir(e.signal, signal))) return;` where `sameDir` treats BUY/STRONG_BUY as one side and SELL/STRONG_SELL as the other. Apply the analogous guard in `patternDatabase.record` (dedupe by asset+direction+PENDING, in addition to the existing id dedupe).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `fix: one record per open setup (stop 30s autocorrelated duplicates)`.

### Task 2.3: Pattern DB — real matched count + TIMEOUT

**Files:**
- Modify: `xau-analyzer/lib/patternDatabase.ts` (`resolvePending` TIMEOUT; `getMLProbability` real count)
- Test: `xau-analyzer/lib/__tests__/patternDatabase.test.ts`

**Interfaces:**
- Produces: `MLProbability.sampleSize` = **count of matched trades** (similarity ≥ 3), not `weightedTotal/8`. Resolution mirrors Task 2.1 (WIN only on TP). Timeouts excluded from win-rate numerator/denominator.

- [ ] **Step 1: Failing test** `patternDatabase.test.ts`: record 4 similar WIN/LOSS resolved trades, query `getMLProbability` with a matching feature vector, assert `sampleSize === <matched count>` and `winRate` matches wins/(wins+losses).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Track `matchedCount` in the loop; set `sampleSize = matchedCount`. Exclude TIMEOUT from `weightedTotal`/`weightedWins`. Apply TIMEOUT rule in `resolvePending`.
- [ ] **Step 4:** Run → PASS + build.
- [ ] **Step 5:** Commit `fix: pattern DB reports real matched count + honest win definition`.

### Task 2.4: Confidence calibration store

**Files:**
- Create: `xau-analyzer/lib/confidenceCalibration.ts`
- Modify: `xau-analyzer/lib/signalHistory.ts` (feed resolved outcomes into calibration)
- Test: `xau-analyzer/lib/__tests__/calibration.test.ts`

**Interfaces:**
- Produces:
  - `confidenceLabel(score0to100): 'Weak'|'Medium'|'Strong'` — <45 Weak, 45–69 Medium, ≥70 Strong.
  - `class CalibrationStore { add(bucket:number, win:boolean): void; realizedWinRate(bucket:number): number | null; totalResolved(): number }` — buckets are 10-wide (0-9,10-19,…). `realizedWinRate` returns `null` until ≥10 resolved in that bucket.
  - `showNumericConfidence(store): boolean` = `store.totalResolved() >= 30`.

- [ ] **Step 1: Failing test** `calibration.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { CalibrationStore, confidenceLabel, showNumericConfidence } from '../confidenceCalibration';
it('labels by band', () => {
  expect(confidenceLabel(20)).toBe('Weak');
  expect(confidenceLabel(55)).toBe('Medium');
  expect(confidenceLabel(80)).toBe('Strong');
});
it('hides numeric confidence until 30 resolved', () => {
  const s = new CalibrationStore();
  for (let i=0;i<29;i++) s.add(70, true);
  expect(showNumericConfidence(s)).toBe(false);
  s.add(70, true);
  expect(showNumericConfidence(s)).toBe(true);
});
it('realized win rate null until 10 in bucket', () => {
  const s = new CalibrationStore();
  for (let i=0;i<9;i++) s.add(70, i%2===0);
  expect(s.realizedWinRate(70)).toBeNull();
});
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `confidenceCalibration.ts`. In `signalHistory.resolvePending`, when a signal resolves to WIN/LOSS (not TIMEOUT), call the shared calibration store `add(entry.confidence, outcome==='WIN')`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: confidence calibration store + Weak/Medium/Strong labels`.

---

## Phase 3: Persistence (survives restarts)

### Task 3.1: JSON storage helper

**Files:**
- Create: `xau-analyzer/lib/storage.ts`
- Modify: `xau-analyzer/.gitignore` (add `.data/`)
- Test: `xau-analyzer/lib/__tests__/storage.test.ts`

**Interfaces:**
- Produces: `loadJson<T>(name: string, fallback: T): T` and `saveJson(name: string, data: unknown): void` (debounced 500ms write to `.data/<name>.json`). Node `fs`, synchronous read on load, async debounced write. Safe if `.data` missing (creates it); safe if file corrupt (returns fallback).

- [ ] **Step 1: Failing test** `storage.test.ts`: `saveJson('test_store', {a:1})` then (after flush) `loadJson('test_store', {})` deep-equals `{a:1}`; `loadJson('missing_xyz', {b:2})` returns `{b:2}`. Use a temp name and clean up.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement with `node:fs`. Expose `flushNow()` for tests. Write to `xau-analyzer/.data`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: local JSON storage helper`.

### Task 3.2: Wire persistence into the two stores

**Files:**
- Modify: `xau-analyzer/lib/signalHistory.ts`, `xau-analyzer/lib/patternDatabase.ts`
- Test: extend existing store tests with a load/save round-trip

**Interfaces:**
- Consumes: `loadJson`/`saveJson`. On construction, `entries`/`records` load from storage; after any mutation (`record`, `resolvePending`), call `saveJson`. Calibration store persists too.

- [ ] **Step 1: Failing test:** construct store, record+resolve, `flushNow()`, construct a *second* store instance, assert it loaded the prior entries.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Load in constructor; save after mutations. Keep the `global` singleton pattern (load once).
- [ ] **Step 4:** Run → PASS + build.
- [ ] **Step 5:** Commit `feat: persist signal history, pattern DB, calibration to disk`.

---

## Phase 4: Trustworthy backtest

### Task 4.1: Timestamp-parameterize the time-based modules

**Files:**
- Modify: `xau-analyzer/lib/sessionAnalysis.ts` (`analyzeSessionAt(now, candles)`), `xau-analyzer/lib/newsRisk.ts` (done in 1.5)
- Test: `xau-analyzer/lib/__tests__/session.test.ts`

**Interfaces:**
- Produces: `analyzeSessionAt(now: Date, candles: Candle[]): SessionAnalysis`; `analyzeSession(candles)` = `analyzeSessionAt(new Date(), candles)`.

- [ ] **Step 1: Failing test:** `analyzeSessionAt(new Date(Date.UTC(2026,0,7,14,0)), [])` → `currentSession === 'LONDON_NY_OVERLAP'`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Add param; keep wrapper.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `refactor: session analysis accepts explicit timestamp`.

### Task 4.2: Backtest core — trade simulator with costs + pessimistic same-bar

**Files:**
- Create: `xau-analyzer/lib/backtestEngine.ts` (pure simulator, testable)
- Test: `xau-analyzer/lib/__tests__/backtestEngine.test.ts`

**Interfaces:**
- Produces:
```ts
export interface SimBar { high:number; low:number; close:number; time:number; }
export interface OpenTrade { dir:'LONG'|'SHORT'; entry:number; stop:number; target:number; entryTime:number; }
export interface Costs { feePct:number; spreadPct:number; slippagePct:number; } // e.g. 0.04/0.02/0.02
export type SimOutcome = 'WIN'|'LOSS'|'TIMEOUT';
// Evaluate one open trade against the NEXT bar. Pessimistic: if both stop and target
// are within the bar range, return LOSS. Applies costs to the realized pnl%.
export function evalBarExit(t: OpenTrade, bar: SimBar, costs: Costs):
  { outcome: SimOutcome|null; exitPrice?:number; pnlPct?:number };
```

- [ ] **Step 1: Failing test** `backtestEngine.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { evalBarExit } from '../backtestEngine';
const costs = { feePct:0, spreadPct:0, slippagePct:0 };
const long = { dir:'LONG' as const, entry:100, stop:98, target:104, entryTime:0 };
it('target hit = WIN', () => {
  expect(evalBarExit(long, {high:105,low:101,close:104,time:1}, costs).outcome).toBe('WIN');
});
it('stop hit = LOSS', () => {
  expect(evalBarExit(long, {high:101,low:97,close:99,time:1}, costs).outcome).toBe('LOSS');
});
it('both in range = LOSS (pessimistic)', () => {
  expect(evalBarExit(long, {high:105,low:97,close:100,time:1}, costs).outcome).toBe('LOSS');
});
it('neither = still open (null)', () => {
  expect(evalBarExit(long, {high:103,low:99,close:101,time:1}, costs).outcome).toBeNull();
});
it('costs reduce win pnl', () => {
  const withCost = evalBarExit(long, {high:105,low:101,close:104,time:1}, {feePct:0.1,spreadPct:0.1,slippagePct:0.1});
  expect(withCost.pnlPct!).toBeLessThan(4); // 4% gross minus costs
});
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `evalBarExit`: check target/stop against bar high/low per direction; both-in-range → LOSS; apply `entry*(1+spread/2+slippage)` style adjustment + `feePct*2` round-trip to pnl%.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: backtest trade simulator (costs + pessimistic same-bar rule)`.

### Task 4.3: Backtest runner uses the real enhanced engine

**Files:**
- Modify: `xau-analyzer/lib/backtesting.ts` (rewrite `runBacktest` to use `backtestEngine` + enhanced signal reconstruction)
- Modify: `xau-analyzer/app/api/backtest/route.ts` (pass cost config if any)
- Test: `xau-analyzer/lib/__tests__/backtesting.test.ts` (a small synthetic candle fixture with a known trade)

**Interfaces:**
- Consumes: `evalBarExit`, `generateEnhancedSignal` (or a lighter reconstruction — see note), `analyzeSessionAt`, `assessNewsRiskAt`, all candle-only modules.
- Produces: same `BacktestResult` shape (already has `timeouts`). Fixes the off-by-one (evaluate the bar immediately after entry). Uses `perTradeSharpe`. Adds `costs` used to `BacktestResult` note field is optional.

**Note on MTF in backtest:** live MTF fetches real higher-TF candles. In the backtest, derive higher timeframes by **resampling** the base interval window (group N base candles into one) rather than extra network calls. Document this approximation in a code comment and in the UI ("backtest MTF is resampled").

- [ ] **Step 1: Failing test:** feed a hand-built ascending candle series that should produce one LONG that hits target; assert `result.wins === 1`, `result.totalTrades === 1`, `Number.isFinite(result.sharpeRatio)`, and `result.timeouts >= 0`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Rewrite `runBacktest`: warmup window, per bar compute the enhanced signal (with resampled MTF + `analyzeSessionAt(new Date(candle.time))` + `assessNewsRiskAt(new Date(candle.time))`), open a trade on directional signals, evaluate exits with `evalBarExit` starting the very next bar, TIMEOUT at max hold. Aggregate stats with the honest helpers.
- [ ] **Step 4:** Run → PASS + build.
- [ ] **Step 5:** Commit `feat: backtest runs the real engine with costs, fixes off-by-one`.

---

## Phase 4.5: Real-time, non-repainting delivery

### Task 4.5.1: Compute signals from the last CLOSED candle

**Files:**
- Create: `xau-analyzer/lib/liveSignal.ts` (a single `computeSignalForAsset(sym, asset)` used by both stream + `/api/signals`, operating on closed candles)
- Modify: `xau-analyzer/app/api/signals/route.ts` and `xau-analyzer/app/api/stream/route.ts` to call it
- Test: `xau-analyzer/lib/__tests__/liveSignal.test.ts`

**Interfaces:**
- Produces: `lastClosedCandle(candles: Candle[]): Candle | null` and a `signalCandleTime` stamp on the emitted payload. Indicators/signal computed on candles **excluding** the still-forming last candle; entry price = last closed candle's close (frozen), not the live ticker.

- [ ] **Step 1: Failing test:** given candles where the final one is "in progress", assert `lastClosedCandle` returns the second-to-last and that the signal's `entryPrice` equals that candle's close.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. The binance `candle` event already carries `closed`. Track per-symbol "last closed candle" in `binanceService` (store closed candles). `computeSignalForAsset` uses closed candles only; stamp `signalCandleTime`.
- [ ] **Step 4:** Run → PASS + build.
- [ ] **Step 5:** Commit `feat: non-repainting signals computed on last closed candle`.

### Task 4.5.2: Fire on candle close (drop the 30s timer)

**Files:**
- Modify: `xau-analyzer/app/api/stream/route.ts`
- (Manual verification — no unit test; SSE timing)

- [ ] **Step 1:** Replace `setInterval(..., 30_000)` with a handler on `binanceService`’s `candle` event: when `closed === true` for a symbol, recompute via `computeSignalForAsset` and `send({type:'signal', ...})`. Debounce: keep last emitted `signalCandleTime` per asset; skip if unchanged direction+candle.
- [ ] **Step 2:** Add a heartbeat every 15s that emits `{type:'freshness', connected, lastCandleTime, serverTime}`.
- [ ] **Step 3:** `npm run build`. Manual: `npm run dev`, open app, confirm a new signal event arrives right after each minute close (watch network/EventStream) and does not change mid-minute.
- [ ] **Step 4:** Commit `feat: emit signals on 1m candle close + freshness heartbeat`.

### Task 4.5.3: Stale-data guard

**Files:**
- Modify: `xau-analyzer/lib/liveSignal.ts` (expose `isStale(lastCandleTime, now, maxAgeMs=90_000)`)
- Test: `xau-analyzer/lib/__tests__/liveSignal.test.ts`

- [ ] **Step 1: Failing test:** `isStale(t, t+91_000)` true; `isStale(t, t+10_000)` false.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; stream/UI use it to show "STALE — do not trade".
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: stale-data guard for signals`.

---

## Phase 5: Simple, readable UI + remove AI

### Task 5.1: Remove Claude AI

**Files:**
- Delete: `xau-analyzer/app/api/analyze/route.ts`
- Modify: `xau-analyzer/package.json` (remove `@anthropic-ai/sdk`)
- Modify: `xau-analyzer/app/page.tsx` (remove AI panel, the 18-output parser, RUN ANALYSIS button, `.env` prompt references)
- Modify: `xau-analyzer/.env.local.example` (drop ANTHROPIC key)

- [ ] **Step 1:** Delete the route file and remove the dependency; `npm install`.
- [ ] **Step 2:** Remove all AI UI (search `page.tsx` for `analyze`, `ANTHROPIC`, `AI Trading Analysis`, `18-Output`, the parser at ~line 841 and section ~1173).
- [ ] **Step 3:** `npm run build` clean.
- [ ] **Step 4:** Commit `feat: remove Claude AI analysis (app is now fully free, no API keys)`.

### Task 5.2: The "one clear call" card

**Files:**
- Create: `xau-analyzer/components/SignalCard.tsx`
- Modify: `xau-analyzer/app/page.tsx` (render it at the top)

**Interfaces:**
- Consumes: enhanced signal payload + freshness + calibration flags.
- Produces: a component showing **ACTION** (BUY/SELL/WAIT/STALE), up to 3 plain reasons (map from `reasons[]`, de-jargoned), **Entry / Stop / Target** (the frozen signal prices), a **confidence label** (Weak/Medium/Strong; numeric only if `showNumericConfidence`), and an honest **track record** line (`getStats`: "X of Y past signals hit target" or "not enough data yet — N so far"). If stale → red "STALE — do not trade".

- [ ] **Step 1:** Build `SignalCard.tsx` per the layout in the spec preview. Plain language, no "Phase" jargon, PAXG labeled.
- [ ] **Step 2:** Wire into `page.tsx` above existing panels. Keep live price separate from locked entry.
- [ ] **Step 3:** `npm run build` + manual `npm run dev` visual check.
- [ ] **Step 4:** Commit `feat: single plain-English signal card`.

### Task 5.3: Collapse advanced panels + disclaimer

**Files:**
- Modify: `xau-analyzer/app/page.tsx`
- Create: `xau-analyzer/components/Disclaimer.tsx`

- [ ] **Step 1:** Wrap SMC / volume profile / MTF table / regime / Monte-Carlo panels in a single "Show details" toggle (collapsed by default). Relabel Monte Carlo panel "Likely 24h range" and show p25–p75, not win odds.
- [ ] **Step 2:** Add a persistent footer `Disclaimer.tsx`: "Educational only — not financial advice. 'Gold' = PAXG on Binance."
- [ ] **Step 3:** Build + manual check.
- [ ] **Step 4:** Commit `feat: collapse advanced panels, add disclaimer, honest Monte Carlo label`.

---

## Phase 6: Code simplification + final tests

### Task 6.1: Split page.tsx into components

**Files:**
- Create: `xau-analyzer/components/*` (one file per panel already extracted; move the rest)
- Modify: `xau-analyzer/app/page.tsx` (becomes a thin container: data hook + layout)

- [ ] **Step 1:** Extract remaining panels (charts, indicators grid, performance, backtest) into `components/`. `page.tsx` target < 300 lines.
- [ ] **Step 2:** De-jargon names/comments ("Phase 21/22" → plain). No behavior change.
- [ ] **Step 3:** `npm run build` + manual check.
- [ ] **Step 4:** Commit `refactor: split UI into focused components, de-jargon`.

### Task 6.2: Coverage sweep + README note

**Files:**
- Create/Modify: any missing `lib/__tests__/*` for `volumeAnalysis`, `marketStructure`, `riskManagement` core math
- Create: `xau-analyzer/README-signals.md` (how signals work, what "win" means, PAXG caveat, free/no-keys)

- [ ] **Step 1:** Add focused tests for the remaining pure math modules (at least one meaningful assertion each).
- [ ] **Step 2:** Write the README note (plain language).
- [ ] **Step 3:** `npm test` all green.
- [ ] **Step 4:** Commit `test: cover core math; docs: plain-language signal README`.

---

## Self-Review (spec coverage)

- Phase 1 (broken math): avgRR ✓, Sharpe ✓, correlation-returns ✓, EMA200 honesty ✓, news DST/estimate ✓.
- Phase 2 (honest metrics): win=TP-only + TIMEOUT ✓, de-dup recording ✓, real ML sample count ✓, confidence label + calibration + 30-trade gate ✓, Monte Carlo relabel (Task 5.3) ✓.
- Phase 3 (persistence): storage helper ✓, wired into both stores + calibration ✓.
- Phase 4 (backtest): timestamp modules ✓, simulator w/ costs+pessimistic ✓, runner uses real engine + off-by-one fix + honest Sharpe ✓.
- Phase 4.5 (real-time): last-closed-candle compute ✓, fire-on-close + drop 30s timer + freshness ✓, stale guard ✓.
- Phase 5 (UI + de-AI): remove Claude ✓, one-call card ✓, collapse + disclaimer + PAXG ✓.
- Phase 6 (simplify + tests): split page.tsx ✓, coverage + README ✓.

No placeholders; types consistent (`SimOutcome`, `NewsRiskAssessment.isEstimate`, `Indicators.ema200: number|null`, `outcome:'TIMEOUT'`, `PerformanceStats.timeouts`).
