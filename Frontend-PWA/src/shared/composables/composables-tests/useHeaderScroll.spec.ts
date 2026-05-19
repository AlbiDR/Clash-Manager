// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineComponent } from "vue";
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
