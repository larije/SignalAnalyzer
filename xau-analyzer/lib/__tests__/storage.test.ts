import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { loadJson, saveJson, flushNow } from '../storage';

const NAME = 'test_store_xyz';
const FILE = path.join(process.cwd(), '.data', `${NAME}.json`);

afterEach(() => {
  for (const suffix of ['', '.tmp', '.corrupt']) {
    try { fs.rmSync(FILE + suffix); } catch { /* ignore */ }
  }
});

describe('storage', () => {
  it('round-trips saved data after flush', () => {
    saveJson(NAME, { a: 1, list: [1, 2, 3] });
    flushNow(NAME);
    expect(loadJson(NAME, {})).toEqual({ a: 1, list: [1, 2, 3] });
  });

  it('returns the fallback for a missing file', () => {
    expect(loadJson('definitely_missing_123', { b: 2 })).toEqual({ b: 2 });
  });

  it('leaves no temp file behind after an atomic write (ST-1)', () => {
    saveJson(NAME, { ok: true });
    flushNow(NAME);
    expect(fs.existsSync(FILE + '.tmp')).toBe(false);
  });

  it('preserves a corrupt file to a .corrupt sidecar instead of silently discarding it (ST-1)', () => {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, '{ this is not valid json');
    const result = loadJson(NAME, { fallback: true });
    expect(result).toEqual({ fallback: true });                 // caller still gets a safe value
    expect(fs.existsSync(FILE + '.corrupt')).toBe(true);        // but the data is not silently lost
    expect(fs.readFileSync(FILE + '.corrupt', 'utf8')).toContain('not valid json');
  });
});
