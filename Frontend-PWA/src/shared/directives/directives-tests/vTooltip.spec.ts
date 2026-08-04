// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { vTooltip } from "../vTooltip";
import { useGhostBenchmarkState } from "../ghostBenchmarkState";

// Mock navigator.vibrate
if (!navigator.vibrate) {
  navigator.vibrate = vi.fn();
}

describe("vTooltip directive", () => {
  let el: HTMLElement;
  const { active, hide } = useGhostBenchmarkState();

  beforeEach(() => {
    el = document.createElement("div");
    // Directive uses event delegation on document.body
    document.body.appendChild(el);
    vi.clearAllMocks();
    hide();

    // Default mock for getBoundingClientRect
    el.getBoundingClientRect = vi.fn().mockReturnValue({
        left: 100,
        top: 100,
        width: 50,
        height: 50,
        bottom: 150,
        right: 150
    });
  });

  afterEach(() => {
    if (el.parentElement) {
      document.body.removeChild(el);
    }
    hide();
  });

  it("should set data-v-tooltip attribute on mount", () => {
    const binding = { value: "Test Tooltip" } as any;
    vTooltip.mounted?.(el, binding, null as any, null as any);
    expect(el.getAttribute("data-v-tooltip")).toBe("true");
    expect((el as any)._tooltipValue).toBe("Test Tooltip");
  });

  it("should update data-v-tooltip attribute on update", () => {
    const binding = { value: "New Tooltip" } as any;
    vTooltip.updated?.(el, binding, null as any, null as any);
    expect(el.getAttribute("data-v-tooltip")).toBe("true");
    expect((el as any)._tooltipValue).toBe("New Tooltip");

    const emptyBinding = { value: null } as any;
    vTooltip.updated?.(el, emptyBinding, null as any, null as any);
    expect(el.hasAttribute("data-v-tooltip")).toBe(false);
    expect((el as any)._tooltipValue).toBe(null);
  });

  it("should show benchmark state on mouseover (fine pointer)", () => {
    const value = "Hover Tooltip";
    const binding = { value } as any;
    vTooltip.mounted?.(el, binding, null as any, null as any);

    el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

    expect(active.value?.content).toBe(value);
  });

  it("should hide benchmark state on mouseout after a delay", async () => {
    vi.useFakeTimers();
    const binding = { value: "Hover Tooltip" } as any;
    vTooltip.mounted?.(el, binding, null as any, null as any);

    el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    expect(active.value?.content).toBe("Hover Tooltip");

    el.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));

    // Should still be visible immediately
    expect(active.value).not.toBeNull();

    vi.advanceTimersByTime(150);
    expect(active.value).toBeNull();

    vi.useRealTimers();
  });

  it("should carry complex BenchmarkData through to the shared state", () => {
    const data = {
      label: "Performance",
      tier: "ELITE",
      value: 85,
      min: 0,
      max: 100,
      avg: 70,
      percent: 15,
      isBetter: true
    };
    const binding = { value: data } as any;
    vTooltip.mounted?.(el, binding, null as any, null as any);

    el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

    expect(active.value?.content).toEqual(data);
    expect(active.value?.anchorRect).toBeTruthy();
  });

  it("should cleanup on unmount", () => {
    const binding = { value: "Unmount Test" } as any;
    vTooltip.mounted?.(el, binding, null as any, null as any);

    el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    expect(active.value).not.toBeNull();

    vTooltip.unmounted?.(el, binding, null as any, null as any);
    expect(active.value).toBeNull();
    expect((el as any)._tooltipValue).toBeUndefined();
  });
});
