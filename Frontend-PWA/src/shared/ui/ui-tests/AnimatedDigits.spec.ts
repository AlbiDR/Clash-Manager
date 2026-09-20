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
});
