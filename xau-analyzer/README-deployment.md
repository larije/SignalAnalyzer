# Browser-local dashboard

Live prices and analysis now run in the open browser, fetching Binance public market data every 15 seconds. Each new closed minute is processed once. Existing pending signals are checked against complete historical candles after a reconnect; the app does not create new signals for time spent away. Incomplete recovery leaves outcomes pending and shows an error.

Signal history, calibration, learned patterns, and candle cursors are saved in IndexedDB. Refreshing restores them. Multiple tabs use atomic transactions so they share the same history without overwriting each other. Different browsers, profiles, devices, and website origins have independent history. Clearing site data removes it. Private browsing may discard it on close.

Use **Export backup** and **Import backup** on the dashboard to move or protect history. Import displays a preview before replacing the current local history. A failed import does not replace the saved snapshot. Storage failures are visible; continuing with temporary history requires an explicit choice. Historical backtests run in a worker so the interface stays responsive.

## Bring over the old local server history

From this folder, run `npm run export:legacy`. Import the generated `.data/browser-backup-....json` file using the dashboard. The original server `.data` files are kept intact. They are ignored by Git and are not uploaded to Vercel.

## Deploy to Vercel

1. Push the repository to your Git provider and import it in Vercel.
2. When importing the outer repository, set **Root Directory** to `xau-analyzer` (the inner folder containing this file).
3. Use the **Next.js** preset, **Build Command** `npm run build`, and the default output directory.
4. Deploy, open the final production URL, and import your backup there if needed.

There are no required API keys, cloud database credentials, or accounts for app users. Market data requires internet access and availability of Binance's public market-data service from the user's browser. Network failures display a retry message and stale status rather than fabricated prices.

History on localhost, preview deployments, and a custom domain is separate. Pick a stable production domain and export before moving to another. Closing or suspending the browser pauses monitoring; this is not an always-running trading service.

The old `/api/stream`, `/api/signals`, and `/api/performance` endpoints return HTTP 410 because analysis and history now belong to each browser. Existing server store wrappers and JSON files remain available in the source for rollback; the deployed UI does not call them.
