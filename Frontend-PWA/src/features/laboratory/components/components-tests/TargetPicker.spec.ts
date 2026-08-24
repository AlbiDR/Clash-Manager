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

  it("should initialize with trackedTag", () => {
    const wrapper = mount(TargetPicker, {
      props: {
        trackedTag: "#ABCDEF",
      },
    });

    const input = wrapper.find("input");
    expect((input.element as HTMLInputElement).value).toBe("#ABCDEF");
  });

  it("should update local state when trackedTag prop changes", async () => {
    const wrapper = mount(TargetPicker, {
      props: {
        trackedTag: "#OLD",
      },
    });

    await wrapper.setProps({ trackedTag: "#NEW" });
    const input = wrapper.find("input");
    expect((input.element as HTMLInputElement).value).toBe("#NEW");
  });

  it("should format tag correctly on lock-in (lowercase to uppercase, add #)", async () => {
    const wrapper = mount(TargetPicker, {
      props: {
        trackedTag: "",
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
        trackedTag: "",
      },
    });

    const input = wrapper.find("input");
    await input.setValue("#def456");

    await wrapper.find(".lock-btn").trigger("click");

    expect(wrapper.emitted("lockIn")![0]).toEqual(["#DEF456"]);
  });

  it("should emit null if input is empty on lock-in", async () => {
    const wrapper = mount(TargetPicker, {
      props: {
        trackedTag: "#SOME",
      },
    });

    const input = wrapper.find("input");
    await input.setValue("");

    await wrapper.find(".lock-btn").trigger("click");

    expect(wrapper.emitted("lockIn")![0]).toEqual([null]);
  });

  it("should trigger lock-in on Enter keydown", async () => {
    const wrapper = mount(TargetPicker, {
      props: {
        trackedTag: "",
      },
    });

    const input = wrapper.find("input");
    await input.setValue("test");
    await input.trigger("keydown", { key: "Enter" });

    expect(wrapper.emitted("lockIn")![0]).toEqual(["#TEST"]);
  });

  it("should call haptics.tap() on lock-in", async () => {
    const wrapper = mount(TargetPicker, {
      props: {
        trackedTag: "TAG",
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
        trackedTag: "TAG",
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
        trackedTag: "TAG",
        playerName: "Clash Master",
      },
    });

    expect(wrapper.find(".player-label").exists()).toBe(true);
    expect(wrapper.find(".label-text").text()).toBe("Clash Master");
  });

  it("should not render player-label if playerName is not provided", () => {
    const wrapper = mount(TargetPicker, {
      props: {
        trackedTag: "TAG",
        playerName: undefined,
      },
    });

    expect(wrapper.find(".player-label").exists()).toBe(false);
  });
});
