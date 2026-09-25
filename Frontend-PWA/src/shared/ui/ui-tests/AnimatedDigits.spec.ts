// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import AnimatedDigits from "../AnimatedDigits.vue";

describe("AnimatedDigits.vue", () => {
  it("keeps digit cells and separators in a fixed, readable display", () => {
    const wrapper = mount(AnimatedDigits, {
      props: { value: "01:30", label: "Time remaining" },
    });

    expect(wrapper.text()).toContain("Time remaining: 01:30");
    expect(wrapper.findAll(".animated-digit-cell")).toHaveLength(5);
    expect(wrapper.findAll(".animated-digit-cell--separator")).toHaveLength(1);
    expect(wrapper.find(".animated-digits-visual").attributes("aria-hidden")).toBe("true");
  });

  it("updates the exposed value while preserving a configured countdown direction", async () => {
    const wrapper = mount(AnimatedDigits, {
      props: { value: "00:01:00", direction: "down", label: "Time remaining" },
    });

    await wrapper.setProps({ value: "00:00:59" });

    expect(wrapper.text()).toContain("Time remaining: 00:00:59");
    expect(wrapper.findAll(".animated-digit-cell")).toHaveLength(8);
  });

  it("automatically determines direction when set to 'auto'", async () => {
    const wrapper = mount(AnimatedDigits, {
      props: { value: 10, direction: "auto", label: "Score" },
    });

    const visual = wrapper.find(".animated-digits-visual");
    expect(visual.classes()).toContain("is-direction-up");

    // Increasing numeric value -> direction remains/becomes 'up'
    await wrapper.setProps({ value: 15 });
    expect(visual.classes()).toContain("is-direction-up");

    // Decreasing numeric value -> direction becomes 'down'
    await wrapper.setProps({ value: 8 });
    expect(visual.classes()).toContain("is-direction-down");

    // Increasing again -> direction becomes 'up'
    await wrapper.setProps({ value: 12 });
    expect(visual.classes()).toContain("is-direction-up");
  });

  it("respects explicit direction prop override over value changes", async () => {
    const wrapper = mount(AnimatedDigits, {
      props: { value: 100, direction: "down", label: "Trophies" },
    });

    const visual = wrapper.find(".animated-digits-visual");
    expect(visual.classes()).toContain("is-direction-down");

    // Value goes up, but direction prop is explicitly "down"
    await wrapper.setProps({ value: 200 });
    expect(visual.classes()).toContain("is-direction-down");
  });

  it("handles string values with units and unchanged numeric values without unexpected direction shifts", async () => {
    const wrapper = mount(AnimatedDigits, {
      props: { value: "100 pts", direction: "auto", label: "Points" },
    });

    const visual = wrapper.find(".animated-digits-visual");
    expect(visual.classes()).toContain("is-direction-up");

    // Update with higher unit string
    await wrapper.setProps({ value: "150 pts" });
    expect(visual.classes()).toContain("is-direction-up");

    // Update with same numeric value
    await wrapper.setProps({ value: "150 pts" });
    expect(visual.classes()).toContain("is-direction-up");
  });
});
