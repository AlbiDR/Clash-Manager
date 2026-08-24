// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment jsdom
 *
 * SPEC: GhostBenchmarkHost.vue
 *
 * Covers the platform-tailored rendering and interaction model of the
 * singleton host component:
 *  1. Desktop (fine pointer): renders popover, hides on scroll, does not
 *     lock body scroll.
 *  2. Mobile (coarse pointer): renders bottom sheet, locks body scroll
 *     when active, unlocks on hide, and swipe-to-dismiss at the 80px
 *     drag threshold.
 *  3. Lifecycle: cleans up scroll listener and body overflow on unmount.
 *
 * Isolation strategy:
 *  - `useGhostBenchmarkState` uses a module-level singleton ref. Tests
 *    call `show` / `hide` through the composable directly rather than
 *    mocking it, so the component observes authentic reactive state.
 *  - `usePointerCapability` reads a MediaQueryList. We stub
 *    `window.matchMedia` per-test to simulate coarse vs fine pointers.
 *  - `Teleport` is disabled via `global.stubs` so the rendered output
 *    is inspectable in the wrapper.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import GhostBenchmarkHost from "../GhostBenchmarkHost.vue";
import { useGhostBenchmarkState } from "../../directives/ghostBenchmarkState";
import type { BenchmarkData } from "../../../core";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BENCHMARK: BenchmarkData = {
  label: "Trophies",
  tier: "ELITE",
  value: 8_000,
  avg: 6_000,
  min: 2_000,
  max: 10_000,
  percent: 33,
  isBetter: true,
};

const FAKE_RECT: DOMRect = {
  left: 100,
  top: 200,
  right: 200,
  bottom: 220,
  width: 100,
  height: 20,
  x: 100,
  y: 200,
  toJSON: () => ({}),
};

/**
 * Stubs window.matchMedia so that the (pointer: coarse) query returns the
 * requested match value. Must be called before the component is mounted
 * because usePointerCapability reads the media query during onMounted.
 */
function stubPointerCapability(coarse: boolean) {
  const mql = {
    matches: coarse,
    media: "(pointer: coarse)",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mql));
  return mql;
}

/** Builds a fake anchor HTMLElement with a stubbed getBoundingClientRect. */
function makeAnchorEl(rect: DOMRect = FAKE_RECT): HTMLElement {
  const el = document.createElement("div");
  el.getBoundingClientRect = () => rect;
  return el;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Reset the module-level singleton between tests.
  const { hide } = useGhostBenchmarkState();
  hide();
  document.body.style.overflow = "";
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Desktop (fine pointer) tests
// ---------------------------------------------------------------------------

describe("GhostBenchmarkHost.vue -- desktop (fine pointer)", () => {
  it("renders the popover when active and pointer is fine", async () => {
    stubPointerCapability(false);
    const { show } = useGhostBenchmarkState();

    const wrapper = mount(GhostBenchmarkHost, {
      global: { stubs: { Teleport: true } },
    });

    show(makeAnchorEl(), BENCHMARK);
    await nextTick();

    expect(wrapper.find(".bc-popover").exists()).toBe(true);
    expect(wrapper.find(".bc-sheet-backdrop").exists()).toBe(false);
  });

  it("does not render the sheet when active and pointer is fine", async () => {
    stubPointerCapability(false);
    const { show } = useGhostBenchmarkState();

    const wrapper = mount(GhostBenchmarkHost, {
      global: { stubs: { Teleport: true } },
    });

    show(makeAnchorEl(), BENCHMARK);
    await nextTick();

    expect(wrapper.find(".bc-sheet-backdrop").exists()).toBe(false);
  });

  it("does not lock body scroll for a fine pointer activation", async () => {
    stubPointerCapability(false);
    const { show } = useGhostBenchmarkState();

    mount(GhostBenchmarkHost, {
      global: { stubs: { Teleport: true } },
    });

    show(makeAnchorEl(), BENCHMARK);
    await nextTick();

    expect(document.body.style.overflow).toBe("");
  });

  it("hides the popover when a window scroll event fires", async () => {
    stubPointerCapability(false);
    const { show } = useGhostBenchmarkState();

    const wrapper = mount(GhostBenchmarkHost, {
      global: { stubs: { Teleport: true } },
    });

    show(makeAnchorEl(), BENCHMARK);
    await nextTick();
    expect(wrapper.find(".bc-popover").exists()).toBe(true);

    window.dispatchEvent(new Event("scroll"));
    await nextTick();

    expect(wrapper.find(".bc-popover").exists()).toBe(false);
  });

  it("does not dismiss on scroll when already hidden", async () => {
    // Verifies no exception is thrown when scroll fires while idle.
    stubPointerCapability(false);

    const wrapper = mount(GhostBenchmarkHost, {
      global: { stubs: { Teleport: true } },
    });

    // active is null at this point -- scroll should be a no-op.
    window.dispatchEvent(new Event("scroll"));
    await nextTick();

    expect(wrapper.find(".bc-popover").exists()).toBe(false);
    wrapper.unmount();
  });

  it("does not lock body scroll for a fine pointer activation (regression guard)", async () => {
    // Verifies that the body lock watcher skips non-coarse contexts.
    stubPointerCapability(false);
    const { show } = useGhostBenchmarkState();

    const wrapper = mount(GhostBenchmarkHost, {
      global: { stubs: { Teleport: true } },
    });

    show(makeAnchorEl(), BENCHMARK);
    await nextTick();

    expect(document.body.style.overflow).toBe("");
    wrapper.unmount();
  });
});

// ---------------------------------------------------------------------------
// Mobile (coarse pointer) tests
// ---------------------------------------------------------------------------

describe("GhostBenchmarkHost.vue -- mobile (coarse pointer)", () => {
  it("renders the bottom sheet when active and pointer is coarse", async () => {
    stubPointerCapability(true);
    const { show } = useGhostBenchmarkState();

    const wrapper = mount(GhostBenchmarkHost, {
      global: { stubs: { Teleport: true } },
    });

    show(makeAnchorEl(), BENCHMARK);
    await nextTick();

    expect(wrapper.find(".bc-sheet-backdrop").exists()).toBe(true);
    expect(wrapper.find(".bc-sheet").exists()).toBe(true);
    expect(wrapper.find(".bc-popover").exists()).toBe(false);
  });

  it("locks body scroll when the sheet becomes active", async () => {
    stubPointerCapability(true);
    const { show } = useGhostBenchmarkState();

    mount(GhostBenchmarkHost, {
      global: { stubs: { Teleport: true } },
    });

    show(makeAnchorEl(), BENCHMARK);
    await nextTick();

    expect(document.body.style.overflow).toBe("hidden");
  });

  it("unlocks body scroll when hide is called", async () => {
    stubPointerCapability(true);
    const { show, hide } = useGhostBenchmarkState();

    mount(GhostBenchmarkHost, {
      global: { stubs: { Teleport: true } },
    });

    show(makeAnchorEl(), BENCHMARK);
    await nextTick();
    expect(document.body.style.overflow).toBe("hidden");

    hide();
    await nextTick();

    expect(document.body.style.overflow).toBe("");
  });

  it("hides the sheet when the backdrop is clicked", async () => {
    stubPointerCapability(true);
    const { show } = useGhostBenchmarkState();

    const wrapper = mount(GhostBenchmarkHost, {
      global: { stubs: { Teleport: true } },
    });

    show(makeAnchorEl(), BENCHMARK);
    await nextTick();

    await wrapper.find(".bc-sheet-backdrop").trigger("click");
    await nextTick();

    expect(wrapper.find(".bc-sheet-backdrop").exists()).toBe(false);
  });

  it("does not hide when clicking inside the sheet itself (click.self guard)", async () => {
    // The backdrop uses @click.self so a click on .bc-sheet should not dismiss.
    stubPointerCapability(true);
    const { show } = useGhostBenchmarkState();

    const wrapper = mount(GhostBenchmarkHost, {
      global: { stubs: { Teleport: true } },
    });

    show(makeAnchorEl(), BENCHMARK);
    await nextTick();

    // Trigger click on the inner sheet element, not the backdrop itself.
    await wrapper.find(".bc-sheet").trigger("click");
    await nextTick();

    // Sheet should still be visible because click.self blocks propagation.
    expect(wrapper.find(".bc-sheet").exists()).toBe(true);
    wrapper.unmount();
  });
});

// ---------------------------------------------------------------------------
// Swipe-to-dismiss gesture tests
// ---------------------------------------------------------------------------

describe("GhostBenchmarkHost.vue -- swipe-to-dismiss gesture", () => {
  it("applies a translateY offset while dragging", async () => {
    stubPointerCapability(true);
    const { show } = useGhostBenchmarkState();

    const wrapper = mount(GhostBenchmarkHost, {
      global: { stubs: { Teleport: true } },
    });

    show(makeAnchorEl(), BENCHMARK);
    await nextTick();

    const sheet = wrapper.find(".bc-sheet");
    await sheet.trigger("touchstart", {
      touches: [{ clientY: 100 }],
    });
    await sheet.trigger("touchmove", {
      touches: [{ clientY: 150 }],
    });
    await nextTick();

    // 150 - 100 = 50px offset
    expect(sheet.attributes("style")).toContain("translateY(50px)");
  });

  it("adds the dragging class to the sheet during a touch drag", async () => {
    stubPointerCapability(true);
    const { show } = useGhostBenchmarkState();

    const wrapper = mount(GhostBenchmarkHost, {
      global: { stubs: { Teleport: true } },
    });

    show(makeAnchorEl(), BENCHMARK);
    await nextTick();

    const sheet = wrapper.find(".bc-sheet");
    await sheet.trigger("touchstart", { touches: [{ clientY: 100 }] });
    await sheet.trigger("touchmove", { touches: [{ clientY: 140 }] });
    await nextTick();

    expect(sheet.classes()).toContain("dragging");
  });

  it("dismisses the sheet when drag exceeds the 80px threshold on touchend", async () => {
    stubPointerCapability(true);
    const { show } = useGhostBenchmarkState();

    const wrapper = mount(GhostBenchmarkHost, {
      global: { stubs: { Teleport: true } },
    });

    show(makeAnchorEl(), BENCHMARK);
    await nextTick();

    const sheet = wrapper.find(".bc-sheet");
    await sheet.trigger("touchstart", { touches: [{ clientY: 100 }] });
    await sheet.trigger("touchmove", { touches: [{ clientY: 190 }] }); // 90px > 80px threshold
    await sheet.trigger("touchend");
    await nextTick();

    expect(wrapper.find(".bc-sheet-backdrop").exists()).toBe(false);
  });

  it("does not dismiss when drag is below the 80px threshold on touchend", async () => {
    stubPointerCapability(true);
    const { show } = useGhostBenchmarkState();

    const wrapper = mount(GhostBenchmarkHost, {
      global: { stubs: { Teleport: true } },
    });

    show(makeAnchorEl(), BENCHMARK);
    await nextTick();

    const sheet = wrapper.find(".bc-sheet");
    await sheet.trigger("touchstart", { touches: [{ clientY: 100 }] });
    await sheet.trigger("touchmove", { touches: [{ clientY: 175 }] }); // 75px < 80px threshold
    await sheet.trigger("touchend");
    await nextTick();

    expect(wrapper.find(".bc-sheet-backdrop").exists()).toBe(true);
  });

  it("resets drag offset to 0 after touchend without dismissal", async () => {
    stubPointerCapability(true);
    const { show } = useGhostBenchmarkState();

    const wrapper = mount(GhostBenchmarkHost, {
      global: { stubs: { Teleport: true } },
    });

    show(makeAnchorEl(), BENCHMARK);
    await nextTick();

    const sheet = wrapper.find(".bc-sheet");
    await sheet.trigger("touchstart", { touches: [{ clientY: 100 }] });
    await sheet.trigger("touchmove", { touches: [{ clientY: 160 }] }); // 60px, no dismiss
    await sheet.trigger("touchend");
    await nextTick();

    // After reset, no inline translateY should remain.
    const style = sheet.attributes("style") ?? "";
    expect(style).not.toContain("translateY");
  });

  it("clamps upward swipe drag to 0 (negative offset is not applied)", async () => {
    stubPointerCapability(true);
    const { show } = useGhostBenchmarkState();

    const wrapper = mount(GhostBenchmarkHost, {
      global: { stubs: { Teleport: true } },
    });

    show(makeAnchorEl(), BENCHMARK);
    await nextTick();

    const sheet = wrapper.find(".bc-sheet");
    await sheet.trigger("touchstart", { touches: [{ clientY: 300 }] });
    // Upward drag: clientY decreases below touchStartY
    await sheet.trigger("touchmove", { touches: [{ clientY: 200 }] });
    await nextTick();

    // dragOffset is clamped by Math.max(0, ...) so no negative translateY.
    const style = sheet.attributes("style") ?? "";
    expect(style).not.toContain("translateY(-");
  });
});

// ---------------------------------------------------------------------------
// Lifecycle cleanup tests
// ---------------------------------------------------------------------------

describe("GhostBenchmarkHost.vue -- lifecycle cleanup", () => {
  it("removes the scroll listener and clears body overflow on unmount", async () => {
    stubPointerCapability(true);
    const removeListenerSpy = vi.spyOn(window, "removeEventListener");
    const { show } = useGhostBenchmarkState();

    const wrapper = mount(GhostBenchmarkHost, {
      global: { stubs: { Teleport: true } },
    });

    show(makeAnchorEl(), BENCHMARK);
    await nextTick();
    expect(document.body.style.overflow).toBe("hidden");

    wrapper.unmount();

    expect(removeListenerSpy).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(document.body.style.overflow).toBe("");
  });
});
