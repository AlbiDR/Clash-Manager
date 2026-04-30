/**
 * @vitest-environment jsdom
 */
import StatusPill from "../StatusPill.vue";
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";

// Mock @core to intercept useHaptics
vi.mock("@core", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useHaptics: () => ({
      tap: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
    }),
  };
});

describe("StatusPill Hub Source Display", () => {
  beforeEach(() => {
    vi.stubGlobal("import", {
      meta: {
        env: {
          VITE_USE_WORKER_HUB: "true"
        }
      }
    });
  });

  it("displays HUB source when hubInfo.source is WORKER", async () => {
    const wrapper = mount(StatusPill, {
      props: { 
        type: "success", 
        text: "Nominal", 
        remoteInfo: { source: "WORKER", dataAge: "5m ago" } 
      },
    });
    
    // Should NOT show hub info until expanded
    expect(wrapper.text()).not.toContain("HUB");
    
    // Expand
    await wrapper.trigger("click");
    
    expect(wrapper.text()).toContain("HUB");
    expect(wrapper.find(".hub-source.worker").exists()).toBe(true);
    expect(wrapper.text()).toContain("5m ago");
  });

  it("displays GAS source when hubInfo.source is GAS", async () => {
    const wrapper = mount(StatusPill, {
      props: { 
        type: "success", 
        text: "Nominal", 
        remoteInfo: { source: "GAS", dataAge: "10m ago" } 
      },
    });
    
    // Expand
    await wrapper.trigger("click");
    
    expect(wrapper.text()).toContain("GAS");
    expect(wrapper.find(".hub-source.gas").exists()).toBe(true);
    expect(wrapper.text()).toContain("10m ago");
  });
});
