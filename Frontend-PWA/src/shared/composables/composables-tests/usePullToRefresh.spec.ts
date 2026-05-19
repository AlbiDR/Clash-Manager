// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import { usePullToRefresh } from "../usePullToRefresh";
import { useHaptics } from "../../../core/services/useHaptics";

// Mock useHaptics using deep import (Frontend Bible Section 9)
vi.mock("../../../core/services/useHaptics", () => ({
  useHaptics: vi.fn(),
}));

describe("usePullToRefresh", () => {
  const mockHaptics = {
    heavy: vi.fn(),
    success: vi.fn(),
  };

  const mockOptions = {
    isRefreshing: ref(false),
    onRefresh: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useHaptics as any).mockReturnValue(mockHaptics);
    mockOptions.isRefreshing.value = false;
    window.scrollY = 0;
  });

  describe("onTouchStart", () => {
    it("initializes pulling when at top and not refreshing", () => {
      const { onTouchStart, isPulling } = usePullToRefresh(mockOptions);
      const event = {
        touches: [{ clientY: 100, clientX: 50 }],
      } as unknown as TouchEvent;

      onTouchStart(event);
      expect(isPulling.value).toBe(true);
    });

    it("guards against starting when window.scrollY > 0", () => {
      window.scrollY = 10;
      const { onTouchStart, isPulling } = usePullToRefresh(mockOptions);
      const event = {
        touches: [{ clientY: 100, clientX: 50 }],
      } as unknown as TouchEvent;

      onTouchStart(event);
      expect(isPulling.value).toBe(false);
    });

    it("guards against starting when already refreshing", () => {
      mockOptions.isRefreshing.value = true;
      const { onTouchStart, isPulling } = usePullToRefresh(mockOptions);
      const event = {
        touches: [{ clientY: 100, clientX: 50 }],
      } as unknown as TouchEvent;

      onTouchStart(event);
      expect(isPulling.value).toBe(false);
    });
  });

  describe("onTouchMove", () => {
    it("calculates pullOffset correctly and triggers heavy haptics at threshold", () => {
      const { onTouchStart, onTouchMove, pullOffset } = usePullToRefresh(mockOptions);

      const startEvent = {
        touches: [{ clientY: 100, clientX: 50 }],
      } as unknown as TouchEvent;
      onTouchStart(startEvent);

      // Move down by 100px. rawDiff = 100.
      // pullOffset = Math.pow(100, 0.9) * 2 ≈ 63.09 * 2 ≈ 126.18
      const moveEvent = {
        touches: [{ clientY: 200, clientX: 50 }],
      } as unknown as TouchEvent;

      onTouchMove(moveEvent);

      expect(pullOffset.value).toBeGreaterThan(120);
      expect(mockHaptics.heavy).toHaveBeenCalled();
    });

    it("implements PTR Protection (cancels pull if horizontal movement is significant)", () => {
      const { onTouchStart, onTouchMove, isPulling, pullOffset } = usePullToRefresh(mockOptions);

      const startEvent = {
        touches: [{ clientY: 100, clientX: 50 }],
      } as unknown as TouchEvent;
      onTouchStart(startEvent);

      // rawDiff = 50, xDiff = 30. 30 > 50 * 0.5 (25).
      const moveEvent = {
        touches: [{ clientY: 150, clientX: 80 }],
      } as unknown as TouchEvent;

      onTouchMove(moveEvent);

      expect(isPulling.value).toBe(false);
      expect(pullOffset.value).toBe(0);
    });

    it("does not trigger haptics if below threshold", () => {
      const { onTouchStart, onTouchMove, pullOffset } = usePullToRefresh(mockOptions);

      const startEvent = {
        touches: [{ clientY: 100, clientX: 50 }],
      } as unknown as TouchEvent;
      onTouchStart(startEvent);

      // rawDiff = 20. pullOffset = Math.pow(20, 0.9) * 2 ≈ 14.7 * 2 ≈ 29.4
      const moveEvent = {
        touches: [{ clientY: 120, clientX: 50 }],
      } as unknown as TouchEvent;

      onTouchMove(moveEvent);

      expect(pullOffset.value).toBeLessThan(120);
      expect(mockHaptics.heavy).not.toHaveBeenCalled();
    });
  });

  describe("onTouchEnd", () => {
    it("triggers onRefresh and success haptics when threshold is met", () => {
      const { onTouchStart, onTouchMove, onTouchEnd } = usePullToRefresh(mockOptions);

      onTouchStart({ touches: [{ clientY: 100, clientX: 50 }] } as any);
      onTouchMove({ touches: [{ clientY: 200, clientX: 50 }] } as any); // pullOffset > 120

      onTouchEnd();

      expect(mockOptions.onRefresh).toHaveBeenCalled();
      expect(mockHaptics.success).toHaveBeenCalled();
    });

    it("does not trigger onRefresh if threshold is not met", () => {
      const { onTouchStart, onTouchMove, onTouchEnd } = usePullToRefresh(mockOptions);

      onTouchStart({ touches: [{ clientY: 100, clientX: 50 }] } as any);
      onTouchMove({ touches: [{ clientY: 120, clientX: 50 }] } as any); // pullOffset < 120

      onTouchEnd();

      expect(mockOptions.onRefresh).not.toHaveBeenCalled();
      expect(mockHaptics.success).not.toHaveBeenCalled();
    });

    it("resets isPulling and pullOffset", () => {
      const { onTouchStart, onTouchMove, onTouchEnd, isPulling, pullOffset } = usePullToRefresh(mockOptions);

      onTouchStart({ touches: [{ clientY: 100, clientX: 50 }] } as any);
      onTouchMove({ touches: [{ clientY: 150, clientX: 50 }] } as any);

      onTouchEnd();

      expect(isPulling.value).toBe(false);
      expect(pullOffset.value).toBe(0);
    });
  });

  describe("ptrStyle", () => {
    it("calculates ptrStyle correctly", () => {
      const { onTouchStart, onTouchMove, ptrStyle } = usePullToRefresh(mockOptions);

      onTouchStart({ touches: [{ clientY: 100, clientX: 50 }] } as any);

      // rawDiff = 60. pullOffset = Math.pow(60, 0.9) * 2 ≈ 39.84 * 2 ≈ 79.68
      onTouchMove({ touches: [{ clientY: 160, clientX: 50 }] } as any);

      expect(ptrStyle.value["--ptr-offset"]).toContain("79.68308154681512px");
      expect(ptrStyle.value["--ptr-opacity"]).toBe(1); // 79.68 / 60 = 1.32, clamped at 1
      expect(ptrStyle.value["--ptr-rotate"]).toMatch(/159\.3661630936302[34]deg/);
    });

    it("clamps ptr-offset at threshold", () => {
       const { onTouchStart, onTouchMove, ptrStyle } = usePullToRefresh(mockOptions);

      onTouchStart({ touches: [{ clientY: 100, clientX: 50 }] } as any);
      onTouchMove({ touches: [{ clientY: 200, clientX: 50 }] } as any); // pullOffset > 120

      expect(ptrStyle.value["--ptr-offset"]).toBe("120px");
    });
  });
});
