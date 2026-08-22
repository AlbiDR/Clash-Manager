// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, afterEach } from "vitest";
import { yieldToInteractionFrame } from "../scheduling";

describe("scheduling.ts", () => {
  const originalEnvMode = import.meta.env.MODE;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    import.meta.env.MODE = originalEnvMode;
  });

  describe("yieldToInteractionFrame()", () => {
    it("returns immediate resolved Promise in test environment", async () => {
      import.meta.env.MODE = "test";
      const result = yieldToInteractionFrame();
      expect(result).toBeInstanceOf(Promise);
      await expect(result).resolves.toBeUndefined();
    });

    it("uses double requestAnimationFrame in non-test browser environment", async () => {
      import.meta.env.MODE = "production";

      const rafCallbacks: FrameRequestCallback[] = [];
      const mockRaf = vi.fn((cb: FrameRequestCallback) => {
        rafCallbacks.push(cb);
        return rafCallbacks.length;
      });

      vi.stubGlobal("window", {
        requestAnimationFrame: mockRaf,
      });

      let resolved = false;
      const promise = yieldToInteractionFrame().then(() => {
        resolved = true;
      });

      // Initially not resolved
      expect(mockRaf).toHaveBeenCalledTimes(1);
      expect(resolved).toBe(false);

      // Execute first frame
      const firstCb = rafCallbacks.shift();
      expect(firstCb).toBeDefined();
      firstCb?.(performance.now());

      // Second requestAnimationFrame should be scheduled
      expect(mockRaf).toHaveBeenCalledTimes(2);
      expect(resolved).toBe(false);

      // Execute second frame
      const secondCb = rafCallbacks.shift();
      expect(secondCb).toBeDefined();
      secondCb?.(performance.now());

      await promise;
      expect(resolved).toBe(true);
    });

    it("falls back to setTimeout when window is undefined (SSR)", async () => {
      import.meta.env.MODE = "production";

      vi.stubGlobal("window", undefined);

      let resolved = false;
      const promise = yieldToInteractionFrame().then(() => {
        resolved = true;
      });

      expect(resolved).toBe(false);
      await promise;
      expect(resolved).toBe(true);
    });

    it("falls back to setTimeout when requestAnimationFrame is not a function", async () => {
      import.meta.env.MODE = "production";

      vi.stubGlobal("window", {
        requestAnimationFrame: undefined,
      });

      let resolved = false;
      const promise = yieldToInteractionFrame().then(() => {
        resolved = true;
      });

      expect(resolved).toBe(false);
      await promise;
      expect(resolved).toBe(true);
    });
  });
});
