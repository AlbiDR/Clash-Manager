import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useLongPress } from '../useLongPress';

describe('useLongPress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Mock navigator.vibrate
    if (typeof navigator !== 'undefined') {
      (navigator as any).vibrate = vi.fn();
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should call the callback after the default duration', () => {
    const callback = vi.fn();
    const { start } = useLongPress(callback);

    start();
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(400);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should call the callback after a custom duration', () => {
    const callback = vi.fn();
    const { start } = useLongPress(callback, 1000);

    start();
    vi.advanceTimersByTime(400);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(600);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should NOT call the callback if canceled early', () => {
    const callback = vi.fn();
    const { start, cancel } = useLongPress(callback);

    start();
    vi.advanceTimersByTime(200);
    cancel();
    vi.advanceTimersByTime(200);

    expect(callback).not.toHaveBeenCalled();
  });

  it('should provide haptic feedback when activated', () => {
    const callback = vi.fn();
    const { start } = useLongPress(callback);

    start();
    vi.advanceTimersByTime(400);

    expect(navigator.vibrate).toHaveBeenCalledWith(60);
  });

  it('should update isLongPressActive state correctly', () => {
    const callback = vi.fn();
    const { isLongPressActive, start, cancel } = useLongPress(callback);

    expect(isLongPressActive.value).toBe(false);

    start();
    expect(isLongPressActive.value).toBe(false);

    vi.advanceTimersByTime(400);
    expect(isLongPressActive.value).toBe(true);

    cancel();
    expect(isLongPressActive.value).toBe(false);
  });

  it('should reset isLongPressActive when starting a new press', () => {
    const callback = vi.fn();
    const { isLongPressActive, start } = useLongPress(callback);

    start();
    vi.advanceTimersByTime(400);
    expect(isLongPressActive.value).toBe(true);

    start();
    expect(isLongPressActive.value).toBe(false);
  });
});
