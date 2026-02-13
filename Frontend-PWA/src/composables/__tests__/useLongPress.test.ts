import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useLongPress } from "../useLongPress";

describe("useLongPress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Mock navigator.vibrate
    if (typeof navigator === "undefined") {
      (global as any).navigator = { vibrate: vi.fn() };
    } else if (!(navigator as any).vibrate) {
      (navigator as any).vibrate = vi.fn();
    }
    vi.spyOn(navigator, "vibrate").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("triggers callback after duration", () => {
    const callback = vi.fn();
    const { start } = useLongPress(callback, 400);

    start();
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(400);
    expect(callback).toHaveBeenCalled();
  });

  it("sets isLongPressActive to true after duration", () => {
    const callback = vi.fn();
    const { isLongPressActive, start } = useLongPress(callback, 400);

    start();
    expect(isLongPressActive.value).toBe(false);

    vi.advanceTimersByTime(400);
    expect(isLongPressActive.value).toBe(true);
  });

  it("cancels timer when cancel is called", () => {
    const callback = vi.fn();
    const { start, cancel } = useLongPress(callback, 400);

    start();
    cancel();

    vi.advanceTimersByTime(400);
    expect(callback).not.toHaveBeenCalled();
  });

  it("resets isLongPressActive when start is called", () => {
    const callback = vi.fn();
    const { isLongPressActive, start } = useLongPress(callback, 400);

    start();
    vi.advanceTimersByTime(400);
    expect(isLongPressActive.value).toBe(true);

    start();
    expect(isLongPressActive.value).toBe(false);
  });

  it("triggers haptic feedback after duration", () => {
    const callback = vi.fn();
    const { start } = useLongPress(callback, 400);

    start();
    vi.advanceTimersByTime(400);

    expect(navigator.vibrate).toHaveBeenCalledWith(60);
  });
});
