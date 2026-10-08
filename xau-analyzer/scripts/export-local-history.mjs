import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.data');
function read(name, fallback) {
  const file = path.join(directory, `${name}.json`);
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
const history = read('signalHistory', { entries: [], calibration: [] });
const patterns = read('patternDatabase', []);
if (!Array.isArray(history.entries) || !Array.isArray(history.calibration) || !Array.isArray(patterns)) {
  throw new Error('Saved history has an unexpected format. The source files have not been changed.');
}
const backup = { version: 1, history, patterns, lastCandle: { BTC: 0, XAU: 0 } };
fs.mkdirSync(directory, { recursive: true });
const output = path.join(directory, `browser-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(output, JSON.stringify(backup, null, 2), { encoding: 'utf8', flag: 'wx' });
console.log(`Exported ${history.entries.length} signals and ${patterns.length} learning records. Import this file in the dashboard:\n${output}`);
