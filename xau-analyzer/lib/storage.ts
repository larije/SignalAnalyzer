// Tiny local JSON persistence so signal history / learning survive restarts.
// No database — just debounced writes to xau-analyzer/.data/<name>.json.
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), '.data');

const timers  = new Map<string, ReturnType<typeof setTimeout>>();
const pending = new Map<string, unknown>();

function filePath(name: string): string {
  return path.join(DATA_DIR, `${name}.json`);
}

/**
 * Synchronously read a JSON file, returning `fallback` if it is missing or corrupt.
 *
 * A missing file is expected (first run) and handled silently. Corrupt JSON is
 * NOT silently discarded: it is logged and preserved to `<name>.json.corrupt` so
 * the accumulated learning data can be recovered and the next save does not
 * overwrite it unnoticed (ST-1).
 */
export function loadJson<T>(name: string, fallback: T): T {
  const file = filePath(name);
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return fallback; // missing file — expected on first run
  }
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    console.error(`[storage] ${name}.json is corrupt — preserving to ${name}.json.corrupt`, e);
    try { fs.renameSync(file, `${file}.corrupt`); } catch { /* best effort */ }
    return fallback;
  }
}

function writeNow(name: string): void {
  const data = pending.get(name);
  if (data === undefined) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    // Atomic write: serialise to a temp file then rename over the target, so a
    // crash or power loss mid-write can never truncate the real file (ST-1).
    const file = filePath(name);
    const tmp  = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
  } catch (e) {
    // Log instead of swallowing — a persistent write failure silently loses all
    // accumulated learning otherwise (ST-1). Persistence must still never crash.
    console.error(`[storage] failed to persist ${name}.json`, e);
  }
  pending.delete(name);
  const t = timers.get(name);
  if (t) clearTimeout(t);
  timers.delete(name);
}

/** Queue a debounced (500ms) write. Repeated calls coalesce to one write. */
export function saveJson(name: string, data: unknown): void {
  pending.set(name, data);
  const existing = timers.get(name);
  if (existing) clearTimeout(existing);
  timers.set(name, setTimeout(() => writeNow(name), 500));
}

/** Force any queued writes to disk immediately (used in tests and on shutdown). */
export function flushNow(name?: string): void {
  if (name) { writeNow(name); return; }
  for (const n of Array.from(pending.keys())) writeNow(n);
}

// ── Shutdown flush ────────────────────────────────────────────────────────────
// saveJson debounces by 500ms, so the newest record/resolution queued at candle
// close is exactly what a process exit within that window would drop. Flush all
// pending writes on shutdown (ST-1). Guarded so hot-reload doesn't stack handlers.
declare global {
  // eslint-disable-next-line no-var
  var _storageShutdownHooked: boolean | undefined;
}
if (!global._storageShutdownHooked) {
  global._storageShutdownHooked = true;
  const flushAll = () => { try { flushNow(); } catch { /* best effort */ } };
  process.once('beforeExit', flushAll);
  process.once('SIGINT',  () => { flushAll(); process.exit(0); });
  process.once('SIGTERM', () => { flushAll(); process.exit(0); });
}
