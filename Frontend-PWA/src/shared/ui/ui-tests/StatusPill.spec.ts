/**
 * @vitest-environment jsdom
 */
import StatusPill from "../StatusPill.vue";
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";

const { tapMock } = vi.hoisted(() => ({
  tapMock: vi.fn(),
}));

// Mock @core to intercept useHaptics
vi.mock("@core", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useHaptics: () => ({
      tap: tapMock,
      warning: vi.fn(),
      error: vi.fn(),
    }),
  };
});

describe("StatusPill", () => {
  it("renders correctly for each valid type", async () => {
    const types = ["success", "warning", "error", "loading"] as const;
    for (const type of types) {
      const wrapper = mount(StatusPill, {
        props: { type, text: `Status ${type}`, nominal: false },
      });
      
      // Expand to see text if not loading (loading is auto-expanded)
      if (type !== "loading") {
        await wrapper.trigger("click");
      }
      
      const expectedText = type === "loading" ? "Syncing..." : `Status ${type}`;
      expect(wrapper.text()).toContain(expectedText);
      expect(wrapper.classes()).toContain(type);
      expect(wrapper.find(".status-dot").exists()).toBe(true);
      
      if (type !== "success") {
        expect(wrapper.find(".dot-nucleus.pulse").exists()).toBe(true);
      }
    }
  });

  it("toggles expanded state and calls haptics on click", async () => {
    const wrapper = mount(StatusPill, {
      props: { type: "success", text: "Ready", nominal: true },
    });
    
    expect(wrapper.find(".label-wrapper").exists()).toBe(false);
    
    await wrapper.trigger("click");
    
    expect(wrapper.classes()).toContain("is-expanded");
    expect(wrapper.find(".label-wrapper").exists()).toBe(true);
    expect(tapMock).toHaveBeenCalled();
  });

  it("shows label automatically when loading even if nominal", () => {
    const wrapper = mount(StatusPill, {
      props: { type: "loading", text: "Loading", nominal: true },
    });
    expect(wrapper.find(".label-wrapper").exists()).toBe(true);
    expect(wrapper.text()).toContain("Syncing...");
  });
});
