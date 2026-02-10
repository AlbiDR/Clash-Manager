/**
* @vitest-environment jsdom
 */
import { StatusPill , ConsoleLayout, ConsoleHeader, FloatingDock, HeaderInfoOverlay } from "@shared";

import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
const { tapMock } = vi.hoisted(() => ({
  tapMock: vi.fn(),
}));

vi.mock("../../composables/useHaptics", () => ({
  useHaptics: () => ({
    tap: tapMock,
  }),
}));

describe("StatusPill", () => {
  it("renders correctly for each type", () => {
    const types = ["updated", "error", "loading", "ready"] as const;
    for (const type of types) {
      const wrapper = mount(StatusPill, {
        props: { type, text: `Status ${type}` },
      });
      expect(wrapper.text()).toContain(`Status ${type}`);
      expect(wrapper.classes()).toContain(type);
      if (type === "loading") {
        expect(wrapper.find(".spinner").exists()).toBe(true);
        expect(wrapper.classes()).toContain("is-refreshing");
      } else {
        expect(wrapper.find(".status-dot").exists()).toBe(true);
      }
    }
  });

  it("emits refresh and calls haptics on click when not loading", async () => {
    const wrapper = mount(StatusPill, {
      props: { type: "ready", text: "Ready" },
    });
    await wrapper.trigger("click");
    expect(wrapper.emitted("refresh")).toBeTruthy();
    expect(tapMock).toHaveBeenCalled();
  });

  it("does not emit refresh or call haptics on click when loading", async () => {
    tapMock.mockClear();
    const wrapper = mount(StatusPill, {
      props: { type: "loading", text: "Loading" },
    });
    await wrapper.trigger("click");
    expect(wrapper.emitted("refresh")).toBeFalsy();
    expect(tapMock).not.toHaveBeenCalled();
  });
});
