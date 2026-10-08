# Browser-local analysis migration

The app will run live analysis in each open browser and save that browser's signal history, calibration, pattern learning, and processed candle cursors in IndexedDB. Different browsers, profiles, devices, and website origins have separate data. There is no account or cloud database.

## Implementation

- Extract browser-safe store classes and signal computation while preserving existing numerical rules and server wrappers for rollback.
- Hydrate one versioned IndexedDB snapshot before analysis. Use atomic read-modify-write transactions to serialize multiple tabs. Reject corrupt/unsupported data and surface unavailable storage.
- Fetch public market data in the browser every 15 seconds. Process each new closed candle once. Replay missing bars for already-open signals in order; do not invent signals while the browser was closed or resolve outcomes across unknown gaps.
- Read dashboard performance from local history. Add validated JSON export and import with a visible replacement preview. Preserve existing local server JSON files and provide an export script for manual migration.
- Run historical backtests in a browser worker. Retire the old server-owned live endpoints and explicitly configure the Next.js project root for Vercel.

## Acceptance

- Refresh/reopen restores history, calibration and learning before new records are written.
- Concurrent tabs cannot overwrite each other's records or duplicate the same candle.
- Failed writes/imports keep the last saved snapshot; temporary storage is clearly labeled.
- Catch-up uses complete chronological candles and never reports a guessed stop/target outcome.
- Stop/unmount cancels polling and network work. Reopening refreshes stale data.
- Existing analysis tests, new persistence/runtime tests, TypeScript checks and production build pass.
- Both themes and selected-asset dashboard behavior are retained.

## Data preservation and rollback

Existing `.data/*.json` files are not deleted or uploaded. `npm run export:legacy` will make a browser-importable backup from them. Reverting the application changes restores the original server path and its saved files. Browser backup files remain local to the user; no automatic cross-device sync is added.

Vercel deployment is a later user action. The root directory is the inner `xau-analyzer` folder. Browser storage belongs to the final deployment origin; preview domains do not share it. Monitoring pauses when the browser is closed or suspended. The UI will describe this and provide export/import for moving data.
