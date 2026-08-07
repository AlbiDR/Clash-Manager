// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { usePointerCapability } from "../usePointerCapability";

describe("usePointerCapability", () => {
  const TestComponent = defineComponent({
    setup() {
      const { isCoarsePointer } = usePointerCapability();
      return { isCoarsePointer };
    },
    template: "<div></div>",
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("Initialization under Browser/JSDOM", () => {
    it("initializes isCoarsePointer to true when media query matches coarse", () => {
      const addEventListenerSpy = vi.fn();
      const removeEventListenerSpy = vi.fn();

      const mql = {
        matches: true,
        media: "(pointer: coarse)",
        addEventListener: addEventListenerSpy,
        removeEventListener: removeEventListenerSpy,
      };

      vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mql));

      const wrapper = mount(TestComponent);
      expect(wrapper.vm.isCoarsePointer).toBe(true);
      expect(addEventListenerSpy).toHaveBeenCalledWith("change", expect.any(Function));
    });

    it("initializes isCoarsePointer to false when media query matches fine", () => {
      const addEventListenerSpy = vi.fn();
      const removeEventListenerSpy = vi.fn();

      const mql = {
        matches: false,
        media: "(pointer: coarse)",
        addEventListener: addEventListenerSpy,
        removeEventListener: removeEventListenerSpy,
      };

      vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mql));

      const wrapper = mount(TestComponent);
      expect(wrapper.vm.isCoarsePointer).toBe(false);
      expect(addEventListenerSpy).toHaveBeenCalledWith("change", expect.any(Function));
    });
  });

  describe("Reactivity and Event Handling", () => {
    it("updates isCoarsePointer reactively when the change event is dispatched", async () => {
      let changeHandler: ((e: any) => void) | null = null;

      const mql = {
        matches: false,
        media: "(pointer: coarse)",
        addEventListener: vi.fn().mockImplementation((event, cb) => {
          if (event === "change") changeHandler = cb;
        }),
        removeEventListener: vi.fn(),
      };

      vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mql));

      const wrapper = mount(TestComponent);
      expect(wrapper.vm.isCoarsePointer).toBe(false);
      expect(changeHandler).not.toBeNull();

      // Simulate a change in the media query matches
      mql.matches = true;
      if (changeHandler) {
        changeHandler(new Event("change"));
      }

      expect(wrapper.vm.isCoarsePointer).toBe(true);

      // Simulate change back to fine
      mql.matches = false;
      if (changeHandler) {
        changeHandler(new Event("change"));
      }

      expect(wrapper.vm.isCoarsePointer).toBe(false);
    });
  });

  describe("Lifecycle and Cleanup", () => {
    it("removes the change event listener on unmount", () => {
      const removeEventListenerSpy = vi.fn();
      const mql = {
        matches: true,
        media: "(pointer: coarse)",
        addEventListener: vi.fn(),
        removeEventListener: removeEventListenerSpy,
      };

      vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mql));

      const wrapper = mount(TestComponent);
      wrapper.unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith("change", expect.any(Function));
    });
  });

  describe("SSR / Headless Fallback Scenario", () => {
    it("does not crash and stays false when window or window.matchMedia is undefined", () => {
      vi.stubGlobal("matchMedia", undefined);

      const wrapper = mount(TestComponent);
      expect(wrapper.vm.isCoarsePointer).toBe(false);
    });
  });
});
