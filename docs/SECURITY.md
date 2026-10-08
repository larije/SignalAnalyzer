# SECURITY.md — xau-analyzer

Audit-era snapshot (2026-09-15). Finding IDs, severities, and priorities are canonical to
the system audit; every finding here survived two-vote adversarial verification. Code
references are relative to the `xau-analyzer/` app folder. For non-security defects
referenced in passing (BUG-*, ST-*), see TECHNICAL_DEBT.md and KNOWN_ISSUES.md.

## Threat model

This app has **no authentication, no accounts, and no secrets — by design.** It is a
single-user educational tool: no cookies, no sessions, no API keys (the Claude
integration was removed; Binance's public market-data API needs no credentials), no
user-supplied content stored beyond query parameters, and persistence is plain JSON files
under `.data/`. There is nothing to steal and nobody to impersonate. The intended
deployment is `next dev` or `next start` on the developer's own machine.

Two facts complicate the "localhost-only" comfort:

1. **The server is LAN-reachable, not loopback-only.** `next dev`/`next start` bind
   `0.0.0.0` by default (`package.json:6-8` uses the plain commands, no `-H 127.0.0.1`).
   Anyone on the same network can reach every route below whenever the app is running —
   which matters directly for SEC-1.
2. **The risk profile changes completely if deployed publicly.** Every route is an
   unauthenticated GET. Findings marked "if deployed" below are theoretical on a home
   LAN and real on the open internet. If you intend to host this publicly, treat the
   hardening checklist at the end as mandatory, not optional.

### HTTP attack surface

| Route | Method | Input validation | Side effects | Notes |
|---|---|---|---|---|
| `/api/stream` | GET (SSE) | none needed | computes signals, mutates learning stores | per-connection compute (PERF-1) |
| `/api/signals` | GET | none needed | computes signals, mutates learning stores | 8 outbound Binance fetches per hit |
| `/api/candles` | GET | interval whitelisted; symbol NOT | none | relay to Binance klines (see refuted finding) |
| `/api/backtest` | GET | symbol/period/interval all whitelisted | none | synchronous CPU-heavy simulation (SEC-2) |
| `/api/performance` | GET | asset param, read-only | none | read-only, benign |

---

## Findings

### SEC-1 — Next.js 14.2.3 carries critical advisories, including unauthenticated RCE on Windows hosts

- **Severity:** Critical (confirmed)
- **Location:** `package.json:14`
- **Problem:** The app pins `next@14.2.3`, which `npm audit` flags with 30+ in-range
  advisories. The most severe applicable one is GHSA-p293-qw3h-jr36 — unauthenticated
  remote code execution on Windows-hosted servers (affected range ≥13.4.0 <15.5.24, no
  workaround). Every precondition holds on this exact machine: the host is Windows 11,
  all five routes declare `runtime = 'nodejs'` (e.g. `app/api/stream/route.ts:5`), and
  the server binds `0.0.0.0`, so it is reachable from the LAN whenever it runs. Also in
  range: four Server Components DoS highs, a cache-poisoning high, a request-
  deserialization DoS, and bundled postcss highs. The AVIF image-optimizer RCE
  (GHSA-2xp9-vwfh-vxw4) is practically inert here (no `sharp` in node_modules, no
  `next/image` usage); the middleware auth bypass is moot (no `middleware.ts`).
- **Risk:** RCE against the framework itself, on this host, with no app-level mitigation
  possible. This dwarfs every application-level issue in the audit.
- **Recommended fix:** `npm install next@14.2.35` immediately — it is npm's
  `fixAvailable`, non-semver-major, and closes the audit for the 14.x line. Note the
  caveat (verifier-confirmed on both sides): the Windows RCE advisory's listed range is
  <15.5.24, so **full closure of GHSA-p293-qw3h-jr36 requires Next 15.5.24+**; treat
  14.2.35 as the stopgap and plan the 15.x migration. The existing green build and 51/51
  test suite verify the stopgap upgrade.
- **Priority:** P0 — the audit's recommended single next step.

### SEC-2 — /api/backtest is an unauthenticated CPU-exhaustion vector

- **Severity:** Medium (filed high, downgraded after verification)
- **Location:** `lib/backtesting.ts:40,163`; route at `app/api/backtest/route.ts:22-23`
- **Problem:** Inputs are properly whitelisted (`app/api/backtest/route.ts:8-20`), but
  each request runs up to 5 sequential 1000-bar Binance fetches and then a fully
  synchronous simulation loop on the main thread — the complete enhanced engine over a
  250-candle window per bar, up to ~4,940 bars. There is no cache, no rate limit, no
  single-flight, no worker; the only guard is a client-side disabled button.
- **Risk:** Each request blocks the Node event loop for a verified ~0.5–1.6 s (546 ms
  typical, 1,626 ms worst case, empirically benchmarked). While blocked, the SSE stream
  stalls and signal computation stops for everyone sharing the process. Locally this is
  a self-inflicted sub-2 s stall per click; publicly deployed, ~1 request/second
  saturates the server — a real but bounded, availability-only DoS. That bounded blast
  radius is why verification downgraded it from high.
- **Recommended fix:** Cache `BacktestResult` per (symbol, period, interval) with a TTL
  — results only change as new candles arrive — plus single-flight so concurrent
  identical requests share one run; move the loop to a worker or add yields; per-IP rate
  limit if ever public.
- **Priority:** P1 (Phase 1 of the roadmap).

### PERF-1 (security face) — Per-connection signal compute amplifies outbound Binance traffic

- **Severity:** Medium (filed high, downgraded after verification)
- **Location:** `app/api/stream/route.ts:36-52`, `lib/multiTimeframe.ts:103-108`,
  `app/api/signals/route.ts:8-11`
- **Problem:** Every SSE connection registers its own candle handler and independently
  runs `computeSignalForAsset` on every closed 1m candle (plus twice at connect). The
  dedup (`lastSignalCandle`, `app/api/stream/route.ts:34,40`) is per-connection, so N
  connections do N identical computations and 4N uncached Binance REST fetches per asset
  per minute. `/api/signals` fires 8 uncached fetches per anonymous GET.
  `binanceService.ts:29` sets `setMaxListeners(500)` with no connection cap enforced.
- **Risk:** An attacker (or just many tabs) opening cheap EventSource connections or
  polling `/api/signals` multiplies requests toward Binance's weight-based rate limits:
  429 responses, then an HTTP 418 IP ban. Verification bounded the blast radius: single-
  user usage (~8 fetches/min vs Binance's 6,000 weight/min) cannot trigger it; the live
  WebSocket feed (`stream.binance.com`) is unaffected by a REST ban; MTF failures fall
  back to a neutral object (`lib/liveSignal.ts:89-91`); and history loads have 5
  fallback hosts. Worst realistic case is a temporary REST ban with silent signal
  degradation on a flooded public deployment. The architecture is still wrong — the
  amplification is structural, not incidental.
- **Recommended fix:** Compute once per (asset, closed-candle time) with single-flight
  memoisation shared across all connections; module-level cache for the MTF fetches;
  cache `/api/signals` until the next candle close; cap SSE connections.
- **Priority:** P1 (Phase 1). See also the performance face of PERF-1 in PERFORMANCE.md.

### ST-3 — SSE stream robustness: no cancel() handler, unguarded enqueue, no backpressure

- **Severity:** Low (filed medium, contested and downgraded after verification)
- **Location:** `app/api/stream/route.ts:19-22` (unguarded `ctrl.enqueue`), cleanup only
  in the abort listener (`app/api/stream/route.ts:83-91`), no `cancel()` handler
- **Problem:** `send()` enqueues unconditionally with no try/catch and never checks
  `desiredSize`; the `ReadableStream` has no `cancel()` callback, so cleanup depends
  entirely on the request's abort signal firing.
- **Why it was downgraded:** The originally claimed process crash and unbounded memory
  growth did not survive verification. An enqueue throw inside the ticker/candle
  listeners is swallowed by the try/catch around the WebSocket message handler
  (`lib/binanceService.ts:62-67`), and Next's process-level uncaughtException handling
  prevents the remaining paths from taking the server down — normal disconnects
  observably do not crash it. For vanished peers, the TCP retransmission timeout
  (~15–30 min) eventually errors the socket and fires abort, bounding buffered growth to
  a few MB per abandoned connection rather than "unbounded". What genuinely remains: a
  throw mid-`emit()` aborts delivery to the remaining listeners (missed-event windows
  for other connections), and half-open connections buffer events for up to the TCP
  timeout.
- **Recommended fix (still worth the small effort):** try/catch in `send()` that sets
  `dead = true` and runs the same cleanup; implement `cancel()`; optionally close
  connections whose `desiredSize` stays negative.
- **Priority:** P2.

### Low-severity items

The first item is the security face of PERF-1; the remaining three are grouped under
**SEC-3** in the canonical register (all P3 unless noted).

| # | Finding | Location | Problem and risk | Fix |
|---|---|---|---|---|
| 1 | Mutating GETs (part of PERF-1, P1) | `lib/liveSignal.ts:102-103,122-126` | Anonymous GETs to `/api/signals` and every SSE connection trigger `resolvePending` and `record` on the persistent learning stores — an external caller controls *when* trades resolve (e.g. forcing resolution at a chosen tick just past the 60-min timeout). Inflation is bounded by dedup and store caps. | Make `/api/signals` read-only; drive record/resolve from a single server-side candle-close hook, never from request handlers. |
| 2 | Raw error text to client (SEC-3) | `app/api/backtest/route.ts:26` | `{ error: String(e) }` on 500 leaks fetch/undici messages, internal hostnames on egress failure, or stack-bearing text. | Log server-side; return a generic `'Backtest failed'`. |
| 3 | No security headers (SEC-3) | `next.config.mjs:1` | No `headers()` block, no CSP: the app can be framed by any origin, and responses lack `X-Content-Type-Options` and `Referrer-Policy`. With no auth or cookies, impact is limited to UI redressing. | Add `headers()` with `X-Frame-Options: DENY` (or `frame-ancestors 'none'`), `nosniff`, `Referrer-Policy: no-referrer`. |
| 4 | Dev-toolchain advisories (SEC-3) | `package.json:26` | `npm audit` flags vitest 2.x (critical: UI-server arbitrary file read/execute; mocker path traversal), vite (Windows `server.fs.deny` bypass; launch-editor NTLMv2 hash disclosure via UNC paths — this dev box is Windows), esbuild dev-server read. None ship in the `next build` output; exposure exists only while running dev tooling. | Upgrade vitest per audit (semver-major, test-only blast radius); never expose the vitest UI or dev server on non-loopback interfaces. |

### REFUTED — /api/candles query-parameter injection ("open klines relay")

Recorded here so future audits do not re-raise it.

- **Original claim (filed medium):** `symbol` is taken from the query string
  (`app/api/candles/route.ts:9`) and string-interpolated into the Binance klines URL
  (`app/api/candles/route.ts:18`); since `searchParams.get` returns the decoded value,
  `?symbol=BTCUSDT%26limit%3D1000` would inject extra parameters into the server-side
  request.
- **Why it is refuted (verifier-confirmed, including live tests against Binance):**
  1. `route.ts:9` applies `.toUpperCase()` to the symbol, so the PoC reaches Binance as
     `&LIMIT=1000` — and Binance parameter names are case-sensitive (`limit`,
     `startTime`, `endTime` are lowercase/camelCase), so injected names are never
     recognised.
  2. Binance strictly validates parameters: unrecognised extras return error `-1104`,
     duplicates return `-1101` — every injection attempt yields a Binance 400, which the
     route surfaces as a 502 (`route.ts:20`). Double-encoding survives the uppercasing
     but arrives still percent-encoded inside the symbol value and fails Binance's
     symbol validation.
  3. Outbound request weight is bounded regardless: `limit` is clamped to 10–200
     (`route.ts:11`) and `interval` is whitelisted (`route.ts:5,13`).
- **Residual (low, hygiene only, kept under SEC-3):** the route lacks the
  `VALID_SYMBOLS` whitelist that `/api/backtest` has (`app/api/backtest/route.ts:9,18`)
  — add it for parity — and a non-numeric `limit` produces `NaN` → Binance 400 → 502, a
  robustness nit (default to 100 on NaN).

---

## Hardening checklist for public deployment

The app is acceptable as a localhost/LAN single-user tool once SEC-1 is patched. **Do
not deploy it publicly without all of the following:**

- [ ] **Upgrade Next.js** to 14.2.35 now, then 15.5.24+ to fully close the Windows RCE
      (SEC-1). Re-run `npm audit` and the test suite after each step.
- [ ] **Bind explicitly.** For local use, run with `-H 127.0.0.1`; for public use, bind
      only behind the proxy below.
- [ ] **Put a reverse proxy with authentication in front** (e.g. nginx/Caddy with basic
      auth or an OAuth proxy). The app has no auth of its own and must never be the
      internet-facing layer.
- [ ] **Rate-limit all routes per IP** at the proxy, with tighter limits on
      `/api/backtest` (SEC-2) and `/api/signals` (PERF-1).
- [ ] **Make `/api/signals` read-only** and move store mutation to a single server-side
      candle-close driver (PERF-1 / low item 1).
- [ ] **Cache and single-flight the backtest** per (symbol, period, interval); consider
      a worker thread (SEC-2).
- [ ] **Add security headers** in `next.config.mjs`: frame-ancestors/X-Frame-Options,
      nosniff, referrer policy (SEC-3).
- [ ] **Stop leaking internals:** generic 500 body on `/api/backtest` (SEC-3).
- [ ] **Whitelist `symbol` on `/api/candles`** to BTCUSDT/PAXGUSDT, matching the
      backtest route (SEC-3 hygiene).
- [ ] **Harden the SSE stream:** guarded `send()`, `cancel()` handler, connection cap
      (ST-3), plus the compute-once fan-out (PERF-1).
- [ ] Cap SSE connections and monitor outbound Binance request weight; a REST 418 ban
      degrades signals silently (PERF-1).
