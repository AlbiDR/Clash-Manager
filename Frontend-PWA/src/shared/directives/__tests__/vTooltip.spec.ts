import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { vTooltip } from "../vTooltip";

// Mock navigator.vibrate
if (!navigator.vibrate) {
  navigator.vibrate = vi.fn();
}

describe("vTooltip directive", () => {
  let el: HTMLElement;

  beforeEach(() => {
    el = document.createElement("div");
    // Directive uses event delegation on document.body
    document.body.appendChild(el);
    vi.clearAllMocks();

    // Reset tooltip state if possible by hiding it
    const existing = document.querySelector(".rich-tooltip") as HTMLElement;
    if (existing) {
      existing.classList.remove("visible");
      existing.innerHTML = "";
    }

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

  it("should show tooltip on mouseover", async () => {
    const value = "Hover Tooltip";
    const binding = { value } as any;
    vTooltip.mounted?.(el, binding, null as any, null as any);

    const event = new MouseEvent("mouseover", { bubbles: true });
    el.dispatchEvent(event);

    const tooltip = document.querySelector(".rich-tooltip") as HTMLElement;
    expect(tooltip).toBeTruthy();
    expect(tooltip.classList.contains("visible")).toBe(true);
    expect(tooltip.innerHTML).toContain(value);
  });

  it("should hide tooltip on mouseout after a delay", async () => {
    vi.useFakeTimers();
    const binding = { value: "Hover Tooltip" } as any;
    vTooltip.mounted?.(el, binding, null as any, null as any);

    // Show it first
    el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    let tooltip = document.querySelector(".rich-tooltip") as HTMLElement;
    expect(tooltip.classList.contains("visible")).toBe(true);

    // Mouse out
    el.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));

    // Should still be visible immediately
    expect(tooltip.classList.contains("visible")).toBe(true);

    // Advance time
    vi.advanceTimersByTime(150);
    expect(tooltip.classList.contains("visible")).toBe(false);

    vi.useRealTimers();
  });

  it("should render complex BenchmarkData correctly", () => {
    const data = {
      label: "Performance",
      tier: "Elite",
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
    const tooltip = document.querySelector(".rich-tooltip") as HTMLElement;

    expect(tooltip.innerHTML).toContain("Performance");
    expect(tooltip.innerHTML).toContain("Elite");
    expect(tooltip.innerHTML).toContain("AVG 70");
    expect(tooltip.innerHTML).toContain("15%");
    expect(tooltip.innerHTML).toContain("better");
  });

  it("should handle long press on touch devices", () => {
    vi.useFakeTimers();
    const binding = { value: "Touch Tooltip" } as any;
    vTooltip.mounted?.(el, binding, null as any, null as any);

    const touchStart = new TouchEvent("touchstart", { bubbles: true });
    el.dispatchEvent(touchStart);

    // Advance time to 450ms for long press
    vi.advanceTimersByTime(450);

    const tooltip = document.querySelector(".rich-tooltip") as HTMLElement;
    expect(tooltip.classList.contains("visible")).toBe(true);
    expect(tooltip.innerHTML).toContain("Touch Tooltip");

    vi.useRealTimers();
  });

  it("should hide on scroll", () => {
    const binding = { value: "Scroll Test" } as any;
    vTooltip.mounted?.(el, binding, null as any, null as any);

    el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    const tooltip = document.querySelector(".rich-tooltip") as HTMLElement;
    expect(tooltip.classList.contains("visible")).toBe(true);

    window.dispatchEvent(new Event("scroll"));
    expect(tooltip.classList.contains("visible")).toBe(false);
  });

  it("should cleanup on unmount", () => {
    const binding = { value: "Unmount Test" } as any;
    vTooltip.mounted?.(el, binding, null as any, null as any);

    // Show it
    el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    const tooltip = document.querySelector(".rich-tooltip") as HTMLElement;
    expect(tooltip.classList.contains("visible")).toBe(true);

    vTooltip.unmounted?.(el, binding, null as any, null as any);
    expect(tooltip.classList.contains("visible")).toBe(false);
    expect((el as any)._tooltipValue).toBeUndefined();
  });

  it("should use Popover API if available", () => {
    const showPopover = vi.fn();
    const hidePopover = vi.fn();

    // Since createTooltip creates a div, we mock HTMLDivElement.prototype
    const originalShow = (HTMLDivElement.prototype as any).showPopover;
    const originalHide = (HTMLDivElement.prototype as any).hidePopover;
    const originalPopover = (HTMLDivElement.prototype as any).popover;

    (HTMLDivElement.prototype as any).showPopover = showPopover;
    (HTMLDivElement.prototype as any).hidePopover = hidePopover;
    (HTMLDivElement.prototype as any).popover = "manual";

    try {
      const binding = { value: "Popover Test" } as any;
      // Re-trigger mount to ensure createTooltip (which might be called) sees the new property
      // But it might have already been created.
      // If it was already created, we manually add it to the existing tooltip element if it exists
      const existing = document.querySelector(".rich-tooltip");
      if (existing) {
        (existing as any).showPopover = showPopover;
        (existing as any).hidePopover = hidePopover;
        (existing as any).popover = "manual";
      }

      vTooltip.mounted?.(el, binding, null as any, null as any);

      el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      expect(showPopover).toHaveBeenCalled();

      window.dispatchEvent(new Event("scroll"));
      expect(hidePopover).toHaveBeenCalled();
    } finally {
      (HTMLDivElement.prototype as any).showPopover = originalShow;
      (HTMLDivElement.prototype as any).hidePopover = originalHide;
      (HTMLDivElement.prototype as any).popover = originalPopover;
    }
  });
});
