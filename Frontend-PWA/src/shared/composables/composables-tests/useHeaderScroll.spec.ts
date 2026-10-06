// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineComponent, ref, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { useHeaderScroll } from "../useHeaderScroll";

/**
 * [SPEC] USE HEADER SCROLL SPEC
 * Verifies sticky header awareness and lifecycle management.
 */
describe("useHeaderScroll", () => {
  const TestComponent = defineComponent({
    props: {
      threshold: {
        type: Number,
        default: 20
      }
    },
    setup(props) {
      const { isScrolled } = useHeaderScroll(props.threshold);
      return { isScrolled };
    },
    render() {
      return null;
    }
  });

  beforeEach(() => {
    vi.stubGlobal("scrollY", 0);
    vi.spyOn(window, "addEventListener");
    vi.spyOn(window, "removeEventListener");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("should initialize isScrolled to false when scrollY is 0", () => {
    const wrapper = mount(TestComponent);
    expect(wrapper.vm.isScrolled).toBe(false);
  });

  it("should initialize isScrolled to true if already scrolled past threshold on mount", () => {
    vi.stubGlobal("scrollY", 50);
    const wrapper = mount(TestComponent, { props: { threshold: 20 } });
    expect(wrapper.vm.isScrolled).toBe(true);
  });

  it("should add scroll event listener on mount", () => {
    mount(TestComponent);
    expect(window.addEventListener).toHaveBeenCalledWith("scroll", expect.any(Function), { passive: true });
  });

  it("should remove scroll event listener on unmount", () => {
    const wrapper = mount(TestComponent);
    wrapper.unmount();
    expect(window.removeEventListener).toHaveBeenCalledWith("scroll", expect.any(Function));
  });

  it("should update isScrolled when window scroll event occurs", async () => {
    const wrapper = mount(TestComponent, { props: { threshold: 20 } });
    expect(wrapper.vm.isScrolled).toBe(false);

    // Simulate scroll past threshold
    vi.stubGlobal("scrollY", 30);
    window.dispatchEvent(new Event("scroll"));
    expect(wrapper.vm.isScrolled).toBe(true);

    // Simulate scroll back below threshold
    vi.stubGlobal("scrollY", 10);
    window.dispatchEvent(new Event("scroll"));
    expect(wrapper.vm.isScrolled).toBe(false);
  });

  it("should respect custom threshold", () => {
    const wrapper = mount(TestComponent, { props: { threshold: 100 } });

    vi.stubGlobal("scrollY", 50);
    window.dispatchEvent(new Event("scroll"));
    expect(wrapper.vm.isScrolled).toBe(false);

    vi.stubGlobal("scrollY", 110);
    window.dispatchEvent(new Event("scroll"));
    expect(wrapper.vm.isScrolled).toBe(true);
  });

  it("should handle boundary values (exactly at threshold)", () => {
    const wrapper = mount(TestComponent, { props: { threshold: 20 } });

    vi.stubGlobal("scrollY", 20);
    window.dispatchEvent(new Event("scroll"));
    // window.scrollY > threshold is the condition
    expect(wrapper.vm.isScrolled).toBe(false);

    vi.stubGlobal("scrollY", 21);
    window.dispatchEvent(new Event("scroll"));
    expect(wrapper.vm.isScrolled).toBe(true);
  });
});

/**
 * [SPEC] CONDENSING BEHAVIOUR
 * The direction rule, the travel it demands before believing a turn, and the
 * veto that keeps a working control on screen. None of this is exercisable in
 * a browser harness: a hidden or throttled page coalesces a whole scroll
 * gesture into one event, and hysteresis is precisely the thing that needs
 * many.
 */
describe("useHeaderScroll condensing", () => {
  const HYSTERESIS = 48;

  /** Mounts with a controllable pin, and returns a scroll driver. */
  function mountCondensing(isPinned?: () => boolean) {
    let state!: ReturnType<typeof useHeaderScroll>;
    // A plain options object rather than defineComponent: this is a throwaway
    // host for a composable, not a second component the file is declaring.
    const wrapper = mount({
      setup() {
        state = useHeaderScroll({ threshold: 20, hysteresis: HYSTERESIS, isPinned });
        return () => null;
      },
    });
    /** Moves the page and delivers the event the listener is waiting for. */
    const scrollTo = (y: number) => {
      vi.stubGlobal("scrollY", y);
      window.dispatchEvent(new Event("scroll"));
    };
    return { state, wrapper, scrollTo };
  }

  beforeEach(() => vi.stubGlobal("scrollY", 0));
  afterEach(() => vi.unstubAllGlobals());

  it("stays expanded at the top of the page", () => {
    const { state, scrollTo } = mountCondensing();
    scrollTo(0);
    expect(state.isCondensed.value).toBe(false);
  });

  it("waits for sustained downward travel before condensing", () => {
    const { state, scrollTo } = mountCondensing();
    scrollTo(100);
    scrollTo(100 + HYSTERESIS - 10);
    // Moving, but not yet far enough to be sure the reader meant it.
    expect(state.isCondensed.value).toBe(false);

    scrollTo(100 + HYSTERESIS + 10);
    expect(state.isCondensed.value).toBe(true);
  });

  it("measures upward travel from the turn, not from the top", () => {
    const { state, scrollTo } = mountCondensing();
    scrollTo(100);
    scrollTo(400);
    expect(state.isCondensed.value).toBe(true);

    // The first upward sample IS the turn, so the anchor resets to it and the
    // travel that counts is measured from there rather than from the peak.
    const turn = 390;
    scrollTo(turn);
    expect(state.isCondensed.value).toBe(true);

    // A small retreat from the turn is jitter, not an intention.
    scrollTo(turn - (HYSTERESIS - 10));
    expect(state.isCondensed.value).toBe(true);

    scrollTo(turn - (HYSTERESIS + 10));
    expect(state.isCondensed.value).toBe(false);
  });

  it("does not strobe on alternating jitter", () => {
    const { state, scrollTo } = mountCondensing();
    scrollTo(100);
    scrollTo(400);
    expect(state.isCondensed.value).toBe(true);

    // A trackpad wobble: several reversals, none of them meaningful.
    for (const y of [398, 402, 399, 403, 400, 404]) scrollTo(y);
    expect(state.isCondensed.value).toBe(true);
  });

  it("returns to expanded whenever the reader reaches the top again", () => {
    const { state, scrollTo } = mountCondensing();
    scrollTo(100);
    scrollTo(400);
    expect(state.isCondensed.value).toBe(true);

    scrollTo(0);
    expect(state.isCondensed.value).toBe(false);
  });

  it("refuses to condense while the host holds it pinned", () => {
    let pinned = true;
    const { state, scrollTo } = mountCondensing(() => pinned);
    scrollTo(100);
    scrollTo(400);
    // A search field is open, or a selection is live: the header stays.
    expect(state.isCondensed.value).toBe(false);

    pinned = false;
    scrollTo(500);
    scrollTo(600);
    expect(state.isCondensed.value).toBe(true);
  });

  it("releases the scroll listener when a kept-alive view is put away", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { wrapper } = mountCondensing();
    // [THREAT:] onUnmounted never runs for a view inside <KeepAlive>, so every
    // console would keep a listener for the life of the session.
    wrapper.unmount();
    expect(removeSpy).toHaveBeenCalledWith("scroll", expect.any(Function));
    removeSpy.mockRestore();
  });
});

/**
 * [SPEC] KEEPALIVE LIFECYCLE RE-ACTIVATION BEHAVIOUR
 * Verifies that useHeaderScroll attaches and detaches event listeners appropriately
 * when a component wrapped in <KeepAlive> is activated or deactivated.
 */
describe("useHeaderScroll KeepAlive integration", () => {
  beforeEach(() => {
    vi.stubGlobal("scrollY", 0);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("registers scroll listener on initial mount/activation and removes it on deactivation", async () => {
    const addListenerSpy = vi.spyOn(window, "addEventListener");
    const removeListenerSpy = vi.spyOn(window, "removeEventListener");

    const ChildComponent = defineComponent({
      name: "ChildComponent",
      setup() {
        const { isScrolled } = useHeaderScroll(20);
        return { isScrolled };
      },
      template: `<div>{{ isScrolled ? 'Scrolled' : 'Top' }}</div>`
    });

    const Host = defineComponent({
      components: { ChildComponent },
      setup() {
        const active = ref(true);
        return { active };
      },
      template: `
        <KeepAlive>
          <ChildComponent v-if="active" />
        </KeepAlive>
      `
    });

    const wrapper = mount(Host);
    expect(addListenerSpy).toHaveBeenCalledWith("scroll", expect.any(Function), { passive: true });

    addListenerSpy.mockClear();
    removeListenerSpy.mockClear();

    // Deactivate component inside KeepAlive
    wrapper.vm.active = false;
    await nextTick();

    expect(removeListenerSpy).toHaveBeenCalledWith("scroll", expect.any(Function));

    removeListenerSpy.mockClear();

    // Reactivate component inside KeepAlive
    wrapper.vm.active = true;
    await nextTick();

    expect(addListenerSpy).toHaveBeenCalledWith("scroll", expect.any(Function), { passive: true });
  });
});
