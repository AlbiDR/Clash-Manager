// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import TenureBadge from "../TenureBadge.vue";

describe("TenureBadge.vue", () => {
  const createWrapper = (props = {}) => {
    return mount(TenureBadge, {
      props: {
        days: 10,
        ...props
      }
    });
  };

  it("renders correctly with a valid number of days", () => {
    const wrapper = createWrapper({ days: 365 });
    expect(wrapper.text()).toBe("365d");
  });

  it("renders '0d' when days is undefined", () => {
    const wrapper = createWrapper({ days: undefined });
    expect(wrapper.text()).toBe("0d");
  });

  it("renders '0d' when days is 0", () => {
    const wrapper = createWrapper({ days: 0 });
    expect(wrapper.text()).toBe("0d");
  });
});
