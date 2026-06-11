// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerVisibilityRefresh } from "../visibility";
import { VISIBILITY_REFRESH_THRESHOLD } from "../../config";

describe("visibility utility", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Default to visible
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should trigger refresh when visibility changes to visible after threshold", () => {
    const onRefresh = vi.fn();
    registerVisibilityRefresh(onRefresh);

    // Change to hidden
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    // Advance time beyond threshold
    vi.advanceTimersByTime(VISIBILITY_REFRESH_THRESHOLD + 1000);

    // Change back to visible
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("should NOT trigger refresh if threshold has not passed", () => {
    const onRefresh = vi.fn();
    registerVisibilityRefresh(onRefresh);

    // Change to hidden
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    // Advance time LESS than threshold
    vi.advanceTimersByTime(VISIBILITY_REFRESH_THRESHOLD - 1000);

    // Change back to visible
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("should remove event listener on cleanup", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const onRefresh = vi.fn();

    const cleanup = registerVisibilityRefresh(onRefresh);
    expect(addSpy).toHaveBeenCalledWith("visibilitychange", expect.any(Function));

    cleanup();
    expect(removeSpy).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  });
});
