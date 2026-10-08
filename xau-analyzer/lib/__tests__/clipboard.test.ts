import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyToClipboard, priceCopyText } from '../clipboard';

afterEach(() => vi.unstubAllGlobals());

describe('copying signal values', () => {
  it('copies prices without display punctuation and retains two decimals', () => {
    expect(priceCopyText(82887.53)).toBe('82887.53');
    expect(priceCopyText(82950)).toBe('82950.00');
  });

  it.each([NaN, Infinity, -Infinity, 0, -1])('does not offer unavailable price %s for copying', value => {
    expect(priceCopyText(value)).toBeNull();
  });

  it('waits for the clipboard write and preserves a risk/reward ratio', async () => {
    let complete!: () => void;
    const writeText = vi.fn(() => new Promise<void>(resolve => { complete = resolve; }));
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const success = vi.fn();
    const copy = copyToClipboard('1:2.08').then(success);
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith('1:2.08');
    expect(success).not.toHaveBeenCalled();
    complete();
    await copy;
    expect(success).toHaveBeenCalledOnce();
  });

  it('reports a rejected clipboard write instead of claiming success', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) } });
    await expect(copyToClipboard('82887.53')).rejects.toThrow('Denied');
  });

  it.each([true, false])('uses the LAN HTTP fallback and handles its result (%s)', async copied => {
    vi.stubGlobal('navigator', {});
    const previousFocus = { focus: vi.fn() };
    const textarea = { value: '', style: {}, setAttribute: vi.fn(), select: vi.fn(), remove: vi.fn() };
    const document = {
      activeElement: previousFocus, createElement: vi.fn(() => textarea),
      body: { appendChild: vi.fn() }, execCommand: vi.fn(() => copied),
    };
    vi.stubGlobal('document', document);
    const result = copyToClipboard('82950.00');
    if (copied) await expect(result).resolves.toBeUndefined();
    else await expect(result).rejects.toThrow();
    expect(textarea.value).toBe('82950.00');
    expect(textarea.select).toHaveBeenCalledOnce();
    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(textarea.remove).toHaveBeenCalledOnce();
    expect(previousFocus.focus).toHaveBeenCalledWith({ preventScroll: true });
  });
});
