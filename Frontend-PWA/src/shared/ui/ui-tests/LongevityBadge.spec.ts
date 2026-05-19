// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import LongevityBadge from "../LongevityBadge.vue";

describe("LongevityBadge.vue", () => {
  it("renders correctly with provided time", () => {
    const time = "2h 15m";
    const wrapper = mount(LongevityBadge, {
      props: { time }
    });
    expect(wrapper.text()).toBe(time);
  });

  it("applies the required CSS classes", () => {
    const wrapper = mount(LongevityBadge, {
      props: { time: "3d" }
    });

    // Should have its own class
    expect(wrapper.classes()).toContain("longevity-badge");
    // Should have inherited classes from BaseBadge and local usage
    expect(wrapper.classes()).toContain("badge");
    expect(wrapper.classes()).toContain("time");
  });

  it("maintains visibility and layout constraints", () => {
    const wrapper = mount(LongevityBadge, {
      props: { time: "12h" }
    });

    // We can't easily test computed styles in Vitest/JSDOM without a full browser,
    // but we can verify the element is present and has the correct classes
    // which are tied to the scoped styles.
    expect(wrapper.find(".longevity-badge").exists()).toBe(true);
  });
});
