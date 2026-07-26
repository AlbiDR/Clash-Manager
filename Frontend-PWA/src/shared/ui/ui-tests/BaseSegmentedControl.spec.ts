// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import BaseSegmentedControl from "../BaseSegmentedControl.vue";

const { mockTap } = vi.hoisted(() => ({
  mockTap: vi.fn()
}));

vi.mock("../../composables/useHaptics", () => ({
  useHaptics: () => ({
    tap: mockTap
  })
}));

describe("BaseSegmentedControl.vue", () => {
  const options = [
    { label: "Option A", value: "a" },
    { label: "Option B", value: "b" }
  ];

  const createWrapper = (props = {}) => {
    return mount(BaseSegmentedControl, {
      props: {
        modelValue: "a",
        options,
        ...props
      },
      global: {
        directives: {
          tactile: {
            mounted(el) {
              el.addEventListener("pointerdown", () => {});
              el.addEventListener("pointerup", () => mockTap());
            }
          }
        }
      }
    });
  };

  it("renders all provided options", () => {
    const wrapper = createWrapper();

    const buttons = wrapper.findAll(".segment-btn");
    expect(buttons).toHaveLength(2);
    expect(buttons[0].text()).toBe("Option A");
    expect(buttons[1].text()).toBe("Option B");
  });

  it("applies active class to the selected option", () => {
    const wrapper = createWrapper({ modelValue: "b" });

    const buttons = wrapper.findAll(".segment-btn");
    expect(buttons[0].classes()).not.toContain("active");
    expect(buttons[1].classes()).toContain("active");
  });

  it("emits update:modelValue and triggers haptics when a new option is clicked", async () => {
    mockTap.mockClear();
    const wrapper = createWrapper();

    const buttons = wrapper.findAll(".segment-btn");
    // Simulate v-tactile haptic trigger via pointer sequence
    await buttons[1].trigger("pointerdown");
    await buttons[1].trigger("pointerup");
    await buttons[1].trigger("click");

    expect(wrapper.emitted("update:modelValue")).toBeTruthy();
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual(["b"]);
    expect(mockTap).toHaveBeenCalled();
  });

  it("does not emit or trigger haptics when clicking the already active option", async () => {
    mockTap.mockClear();
    const wrapper = createWrapper();

    const buttons = wrapper.findAll(".segment-btn");
    await buttons[0].trigger("pointerdown");
    await buttons[0].trigger("pointerup");
    await buttons[0].trigger("click");

    expect(wrapper.emitted("update:modelValue")).toBeFalsy();
    expect(mockTap).not.toHaveBeenCalled();
  });

  it("applies compact class when prop is set", () => {
    const wrapper = createWrapper({ compact: true });

    expect(wrapper.find(".segmented-control").classes()).toContain("compact");
  });
});
