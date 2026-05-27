// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import VoyageHistoryChart from "../VoyageHistoryChart.vue";

describe("VoyageHistoryChart", () => {
  it("renders nothing when history is empty or dash", () => {
    const wrapper = mount(VoyageHistoryChart, {
      props: { history: "-" },
      global: {
        directives: {
          tooltip: {},
        },
      },
    });
    expect(wrapper.find(".base-chart").exists()).toBe(false);
    expect(wrapper.find(".chart-empty").exists()).toBe(true);
  });

  it("renders correct number of bars including projection", () => {
    const history = "250 2024-01-01 | 150 2024-01-08 | 0 2024-01-15";
    const wrapper = mount(VoyageHistoryChart, {
      props: { history },
      global: {
        directives: {
          tooltip: {},
        },
      },
    });
    const bars = wrapper.findAll(".bar");
    expect(bars).toHaveLength(4);
  });

  it("applies correct CSS classes based on crown thresholds and projection", () => {
    const history = "250 2024-01-01 | 150 2024-01-08 | 0 2024-01-15";
    const wrapper = mount(VoyageHistoryChart, {
      props: { history },
      global: {
        directives: {
          tooltip: {},
        },
      },
    });
    const bars = wrapper.findAll(".bar");
    expect(bars[0].classes()).toContain("bar-miss"); // 0
    expect(bars[1].classes()).toContain("bar-win");  // 150 (winThreshold is 100 in VoyageHistoryChart)
    expect(bars[2].classes()).toContain("bar-win");  // 250
    expect(bars[3].classes()).toContain("bar-projected");
  });
});
