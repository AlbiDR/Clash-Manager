// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import BaseBadge from "../BaseBadge.vue";

describe("BaseBadge.vue", () => {
  it("renders slot content correctly", () => {
    const wrapper = mount(BaseBadge, {
      slots: {
        default: "Test Badge",
      },
    });

    expect(wrapper.text()).toBe("Test Badge");
    expect(wrapper.classes()).toContain("badge");
  });

  it("renders correctly without content", () => {
    const wrapper = mount(BaseBadge);
    expect(wrapper.classes()).toContain("badge");
    expect(wrapper.text()).toBe("");
  });
});
