// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { useViewport } from "../useViewport";

describe("useViewport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set a default width
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 1200,
    });
  });

  const TestComponent = defineComponent({
    setup() {
      const viewport = useViewport();
      return { ...viewport };
    },
    template: "<div></div>",
  });

  it("initializes with correct values for desktop", () => {
    window.innerWidth = 1200;
    const wrapper = mount(TestComponent);
    expect(wrapper.vm.isDesktop).toBe(true);
    expect(wrapper.vm.isMobileNarrow).toBe(false);
  });

  it("initializes with correct values for mobile", () => {
    window.innerWidth = 800;
    const wrapper = mount(TestComponent);
    expect(wrapper.vm.isDesktop).toBe(false);
    expect(wrapper.vm.isMobileNarrow).toBe(false);
  });

  it("initializes with correct values for narrow mobile", () => {
    window.innerWidth = 300;
    const wrapper = mount(TestComponent);
    expect(wrapper.vm.isDesktop).toBe(false);
    expect(wrapper.vm.isMobileNarrow).toBe(true);
  });

  describe("Reactivity", () => {
    it("updates values when window is resized", async () => {
      window.innerWidth = 1200;
      const wrapper = mount(TestComponent);
      expect(wrapper.vm.isDesktop).toBe(true);

      window.innerWidth = 800;
      window.dispatchEvent(new Event("resize"));
      expect(wrapper.vm.isDesktop).toBe(false);

      window.innerWidth = 300;
      window.dispatchEvent(new Event("resize"));
      expect(wrapper.vm.isMobileNarrow).toBe(true);
    });
  });

  describe("Boundary Conditions", () => {
    it("handles the 1024px desktop threshold correctly", () => {
      // isDesktop is window.innerWidth > 1024
      window.innerWidth = 1024;
      let wrapper = mount(TestComponent);
      expect(wrapper.vm.isDesktop).toBe(false);

      window.innerWidth = 1025;
      wrapper = mount(TestComponent);
      expect(wrapper.vm.isDesktop).toBe(true);
    });

    it("handles the 360px narrow mobile threshold correctly", () => {
      // isMobileNarrow is window.innerWidth < 360
      window.innerWidth = 360;
      let wrapper = mount(TestComponent);
      expect(wrapper.vm.isMobileNarrow).toBe(false);

      window.innerWidth = 359;
      wrapper = mount(TestComponent);
      expect(wrapper.vm.isMobileNarrow).toBe(true);
    });
  });

  describe("Lifecycle", () => {
    it("removes the event listener on unmount", () => {
      const removeSpy = vi.spyOn(window, "removeEventListener");
      const wrapper = mount(TestComponent);

      wrapper.unmount();

      expect(removeSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    });

    it("stops updating after unmount", async () => {
      window.innerWidth = 1200;
      const wrapper = mount(TestComponent);
      const vm = wrapper.vm as any;
      expect(vm.isDesktop).toBe(true);

      wrapper.unmount();

      window.innerWidth = 800;
      window.dispatchEvent(new Event("resize"));

      // Should still be true because listener was removed and it's no longer reactive to window events
      expect(vm.isDesktop).toBe(true);
    });
  });
});
