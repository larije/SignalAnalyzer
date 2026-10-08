import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNotificationTimer } from '../notificationTimer';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('notification lifetime', () => {
  it('dismisses once after its visible lifetime', () => {
    const dismiss = vi.fn();
    const timer = createNotificationTimer(dismiss, 4500);
    vi.advanceTimersByTime(4499);
    expect(dismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    timer.resume();
    vi.advanceTimersByTime(4500);
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it('preserves the remaining time while hovered, focused, or in a hidden tab', () => {
    const dismiss = vi.fn();
    const timer = createNotificationTimer(dismiss, 4500);
    vi.advanceTimersByTime(1000);
    timer.pause();
    timer.pause();
    vi.advanceTimersByTime(10000);
    expect(dismiss).not.toHaveBeenCalled();
    timer.resume();
    timer.resume();
    vi.advanceTimersByTime(3499);
    expect(dismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it('cancels old timers when a notification is replaced or dismissed', () => {
    const dismiss = vi.fn();
    const timer = createNotificationTimer(dismiss, 4500);
    vi.advanceTimersByTime(2000);
    timer.cancel();
    timer.resume();
    vi.advanceTimersByTime(10000);
    expect(dismiss).not.toHaveBeenCalled();
  });
});
