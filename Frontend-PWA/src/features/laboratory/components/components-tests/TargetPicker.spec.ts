// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import TargetPicker from "../TargetPicker.vue";

const { mockHaptics, mockVTactile } = vi.hoisted(() => {
  const tap = vi.fn();
  return {
    mockHaptics: {
      tap,
    },
    mockVTactile: {
      mounted(el: any) {
        el.addEventListener("pointerdown", () => {});
        el.addEventListener("pointerup", () => tap());
      }
    }
  };
});

vi.mock("@shared/composables/useHaptics", () => ({
  useHaptics: vi.fn(() => mockHaptics),
}));

// Mock shared components to avoid full render and barrel side effects
vi.mock("@shared", () => ({
  Icon: {
    name: "Icon",
    template: '<div class="mock-icon" :data-name="name" :data-size="size"></div>',
    props: ["name", "size"],
  },
  useHaptics: vi.fn(() => mockHaptics),
  vTactile: mockVTactile,
}));

describe("TargetPicker.vue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize with modelValue", () => {
    const wrapper = mount(TargetPicker, {
      props: {
        modelValue: "#ABCDEF",
      },
    });

    const input = wrapper.find("input");
    expect((input.element as HTMLInputElement).value).toBe("#ABCDEF");
  });

  it("should initialize with empty string if modelValue is null", () => {
    const wrapper = mount(TargetPicker, {
      props: {
        modelValue: null,
      },
    });

    const input = wrapper.find("input");
    expect((input.element as HTMLInputElement).value).toBe("");
  });

  it("should update local state when modelValue prop changes", async () => {
    const wrapper = mount(TargetPicker, {
      props: {
        modelValue: "#OLD",
      },
    });

    await wrapper.setProps({ modelValue: "#NEW" });
    const input = wrapper.find("input");
    expect((input.element as HTMLInputElement).value).toBe("#NEW");

    await wrapper.setProps({ modelValue: null });
    expect((input.element as HTMLInputElement).value).toBe("");
  });

  it("should format tag correctly on lock-in (lowercase to uppercase, add #)", async () => {
    const wrapper = mount(TargetPicker, {
      props: {
        modelValue: "",
      },
    });

    const input = wrapper.find("input");
    await input.setValue("abc123");

    await wrapper.find(".lock-btn").trigger("click");

    expect(wrapper.emitted("lockIn")).toBeTruthy();
    expect(wrapper.emitted("lockIn")![0]).toEqual(["#ABC123"]);
  });

  it("should format tag correctly on lock-in (already has #)", async () => {
    const wrapper = mount(TargetPicker, {
      props: {
        modelValue: "",
      },
    });

    const input = wrapper.find("input");
    await input.setValue("#def456");

    await wrapper.find(".lock-btn").trigger("click");

    expect(wrapper.emitted("lockIn")![0]).toEqual(["#DEF456"]);
  });

  it("should sanitize whitespace padding on lock-in", async () => {
    const wrapper = mount(TargetPicker, {
      props: {
        modelValue: "",
      },
    });

    const input = wrapper.find("input");
    await input.setValue("   2p0882   ");

    await wrapper.find(".lock-btn").trigger("click");

    expect(wrapper.emitted("lockIn")![0]).toEqual(["#2P0882"]);
  });

  it("should emit null if input is empty or whitespace-only on lock-in", async () => {
    const wrapper = mount(TargetPicker, {
      props: {
        modelValue: "#SOME",
      },
    });

    const input = wrapper.find("input");
    await input.setValue("");

    await wrapper.find(".lock-btn").trigger("click");

    expect(wrapper.emitted("lockIn")![0]).toEqual([null]);

    await input.setValue("   ");
    await wrapper.find(".lock-btn").trigger("click");

    expect(wrapper.emitted("lockIn")![1]).toEqual([null]);
  });

  it("should trigger lock-in on Enter keydown", async () => {
    const wrapper = mount(TargetPicker, {
      props: {
        modelValue: "",
      },
    });

    const input = wrapper.find("input");
    await input.setValue("test");
    await input.trigger("keydown", { key: "Enter" });

    expect(wrapper.emitted("lockIn")![0]).toEqual(["#TEST"]);
  });

  it("should ignore non-Enter keydown events", async () => {
    const wrapper = mount(TargetPicker, {
      props: {
        modelValue: "",
      },
    });

    const input = wrapper.find("input");
    await input.setValue("test");
    await input.trigger("keydown", { key: "Escape" });
    await input.trigger("keydown", { key: "Tab" });
    await input.trigger("keydown", { key: "a" });

    expect(wrapper.emitted("lockIn")).toBeFalsy();
  });

  it("should call haptics.tap() on lock-in button press", async () => {
    const wrapper = mount(TargetPicker, {
      props: {
        modelValue: "TAG",
      },
    });

    const lockBtn = wrapper.find(".lock-btn");
    await lockBtn.trigger("pointerdown");
    await lockBtn.trigger("pointerup");
    await lockBtn.trigger("click");
    expect(mockHaptics.tap).toHaveBeenCalled();
  });

  it("should disable button and show loader icon when isFetching is true", () => {
    const wrapper = mount(TargetPicker, {
      props: {
        modelValue: "TAG",
        isFetching: true,
      },
    });

    const button = wrapper.find(".lock-btn");
    expect((button.element as HTMLButtonElement).disabled).toBe(true);
    expect(wrapper.find(".input-box").classes()).toContain("is-fetching");

    // Find icon specifically within the button
    const icon = button.findComponent({ name: "Icon" });
    expect(icon.props("name")).toBe("loader");
  });

  it("should render playerName when provided", () => {
    const wrapper = mount(TargetPicker, {
      props: {
        modelValue: "TAG",
        playerName: "Clash Master",
      },
    });

    expect(wrapper.find(".player-label").exists()).toBe(true);
    expect(wrapper.find(".label-text").text()).toBe("Clash Master");
  });

  it("should not render player-label if playerName is not provided", () => {
    const wrapper = mount(TargetPicker, {
      props: {
        modelValue: "TAG",
        playerName: undefined,
      },
    });

    expect(wrapper.find(".player-label").exists()).toBe(false);
  });
});
