import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, THEME_INIT_SCRIPT, THEME_STORAGE_KEY, tint } from '../theme';

afterEach(() => vi.unstubAllGlobals());

describe('saved theme', () => {
  it.each(['light', 'dark'])('restores %s before the page renders', saved => {
    const document = { documentElement: { dataset: {} as Record<string, string> } };
    const getItem = vi.fn(() => saved);
    runInNewContext(THEME_INIT_SCRIPT, { document, localStorage: { getItem } });
    expect(document.documentElement.dataset.theme).toBe(saved);
    expect(getItem).toHaveBeenCalledWith(THEME_STORAGE_KEY);
  });

  it.each([null, 'invalid'])('defaults to light when the stored value is %s', saved => {
    const document = { documentElement: { dataset: {} as Record<string, string> } };
    runInNewContext(THEME_INIT_SCRIPT, { document, localStorage: { getItem: () => saved } });
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('still renders the light theme when access to storage is blocked', () => {
    const document = { documentElement: { dataset: {} as Record<string, string> } };
    const context = { document, get localStorage() { throw new Error('Storage blocked'); } };
    runInNewContext(THEME_INIT_SCRIPT, context);
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('applies and saves both choices immediately', () => {
    const document = { documentElement: { dataset: { theme: 'light' } } };
    const setItem = vi.fn();
    vi.stubGlobal('document', document);
    vi.stubGlobal('window', { localStorage: { setItem } });
    for (const theme of ['dark', 'light'] as const) {
      applyTheme(theme);
      expect(document.documentElement.dataset.theme).toBe(theme);
      expect(setItem).toHaveBeenLastCalledWith(THEME_STORAGE_KEY, theme);
    }
  });

  it('keeps the toggle usable when saving the preference is blocked', () => {
    const document = { documentElement: { dataset: { theme: 'light' } } };
    vi.stubGlobal('document', document);
    vi.stubGlobal('window', { get localStorage() { throw new Error('Storage blocked'); } });
    expect(() => applyTheme('dark')).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('theme-aware translucent colors', () => {
  it('retains alpha when the base color is a CSS variable', () => {
    expect(tint('var(--signal-cyan)', '18')).toBe('color-mix(in srgb, var(--signal-cyan) 9.41%, transparent)');
    expect(tint('#155e75', 'FF')).toBe('color-mix(in srgb, #155e75 100%, transparent)');
    expect(tint('var(--signal-red)', '00')).toBe('color-mix(in srgb, var(--signal-red) 0%, transparent)');
  });
});
