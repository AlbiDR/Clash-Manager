// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import StatsGrid from "../StatsGrid.vue";

describe("StatsGrid.vue", () => {
  it("renders slot content", () => {
    const wrapper = mount(StatsGrid, {
      props: { columns: 2 },
      slots: {
        default: '<div class="test-content">Content</div>',
      },
    });
    expect(wrapper.find(".test-content").exists()).toBe(true);
  });

  it("applies correct column class for 2 columns", () => {
    const wrapper = mount(StatsGrid, {
      props: { columns: 2 },
    });
    expect(wrapper.find(".stats-grid").classes()).toContain("cols-2");
  });

  it("applies correct column class for 3 columns", () => {
    const wrapper = mount(StatsGrid, {
      props: { columns: 3 },
    });
    expect(wrapper.find(".stats-grid").classes()).toContain("cols-3");
  });

  it("sets aria-busy when loading", () => {
    const wrapper = mount(StatsGrid, {
      props: { columns: 2, loading: true },
    });
    expect(wrapper.find(".stats-grid").attributes("aria-busy")).toBe("true");
  });

  it("sets aria-busy to false when not loading", () => {
    const wrapper = mount(StatsGrid, {
      props: { columns: 2, loading: false },
    });
    expect(wrapper.find(".stats-grid").attributes("aria-busy")).toBe("false");
  });
});
