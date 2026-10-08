# How the signals work (plain language)

This app watches two markets live on Binance and gives you one clear call for each:
**BUY**, **SELL**, or **WAIT** — with a locked entry, stop, and target you can copy.

## The short version

- **Data:** live Binance candles. It's **free** and needs **no API keys**.
- **"Gold / XAU" is actually PAXG** — a tokenized-gold crypto on Binance. It tracks
  spot gold but isn't identical to it (own liquidity, trades 24/7). The app labels this honestly.
- **Bitcoin** is real BTC/USDT.
- **Not financial advice.** It's an educational tool. Signals can be wrong.

## Real-time and non-repainting

For copy-trading, a signal is only useful if it doesn't change after you act on it.

- The signal is computed on the **last _closed_ 1-minute candle**, never the candle that's
  still forming. Once it fires, the direction, entry, stop, and target are **frozen**.
- A fresh signal is emitted within a second or two of **each minute's close**.
- The card shows **"Signal as of HH:MM:SS (candle close)"** and the live price separately,
  so you always know which price to act on.
- If the data connection goes quiet (>90s), the card switches to **"STALE — do not trade"**
  instead of showing a stale signal.

## What "win" honestly means

A recorded signal resolves in one of three ways:

- **WIN** — price reached the **take-profit** target.
- **LOSS** — price hit the **stop-loss** first.
- **TIMEOUT** — neither happened within the hold window. This is **not** counted as a win.

The **win rate** is wins ÷ (wins + losses). Timeouts are reported separately, never hidden
inside the win rate. A tiny drift in your favour is a timeout, not a win.

## Honest confidence and stats

- **Confidence** shows as a plain label (**Weak / Medium / Strong**). A precise percentage
  only appears once there are **30+ resolved signals** to back it up.
- The **"win rate of similar past signals"** panel stays hidden until there are enough
  real, resolved, independent samples (and always shows the sample size).
- The same open setup is **recorded once**, not every few seconds — so stats aren't
  inflated by counting the same trade many times.
- History and learning are **saved to disk** (`.data/`), so they survive restarts.

## The backtest

The **Performance → Backtest** runs the **same** engine the live app uses, over historical
candles, and is deliberately conservative:

- It charges **fees + spread + slippage** on every trade.
- If a bar's range touches both the stop and the target, it books a **LOSS** (worst case),
  because we can't know which was hit first.
- Higher timeframes are **resampled** from the base interval (an approximation of the live
  multi-timeframe view — noted so you don't over-read the numbers).

## Running it

```
npm install
npm run dev     # start the app
npm test        # run the math tests
npm run build   # production build
```

Open http://localhost:3000. No keys, no config.
