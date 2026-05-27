// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import BaseHistoryChart from "../BaseHistoryChart.vue";

describe("BaseHistoryChart.vue", () => {
  const defaultProps = {
    data: [
      { id: "1", value: 10, tooltipLabel: "Point 1" },
      { id: "2", value: 50, tooltipLabel: "Point 2" },
      { id: "3", value: 100, tooltipLabel: "Point 3" },
    ],
    projection: null,
    theme: "war" as const,
    maxScale: 100,
  };

  // Mock v-tooltip directive
  const global = {
    directives: {
      tooltip: () => {},
    },
  };

  it("renders the correct number of bars", () => {
    const wrapper = mount(BaseHistoryChart, {
      props: defaultProps,
      global,
    });
    expect(wrapper.findAll(".bar")).toHaveLength(3);
  });

  it("calculates bar heights correctly and respects CHART_MIN_HEIGHT", () => {
    const wrapper = mount(BaseHistoryChart, {
      props: {
        ...defaultProps,
        data: [
          { id: "min", value: 0, tooltipLabel: "Min" },
          { id: "mid", value: 50, tooltipLabel: "Mid" },
          { id: "max", value: 100, tooltipLabel: "Max" },
        ],
      },
      global,
    });

    const bars = wrapper.findAll(".bar");
    // CHART_MIN_HEIGHT is 15%
    expect(bars[0].attributes("style")).toContain("height: 15%");
    expect(bars[1].attributes("style")).toContain("height: 50%");
    expect(bars[2].attributes("style")).toContain("height: 100%");
  });

  it("applies theme classes correctly", () => {
    const warWrapper = mount(BaseHistoryChart, {
      props: { ...defaultProps, theme: "war" },
      global,
    });
    expect(warWrapper.find(".base-chart").classes()).toContain("theme-war");

    const voyageWrapper = mount(BaseHistoryChart, {
      props: { ...defaultProps, theme: "voyage" },
      global,
    });
    expect(voyageWrapper.find(".base-chart").classes()).toContain("theme-voyage");
  });

  it("generates a trend line path and correctly identifies positivity", () => {
    // Upward trend
    const posWrapper = mount(BaseHistoryChart, {
      props: defaultProps,
      global,
    });
    const posPath = posWrapper.find(".trend-path");
    expect(posPath.exists()).toBe(true);
    expect(posPath.classes()).toContain("positive");

    // Downward trend
    const negWrapper = mount(BaseHistoryChart, {
      props: {
        ...defaultProps,
        data: [
          { id: "1", value: 100, tooltipLabel: "Point 1" },
          { id: "2", value: 50, tooltipLabel: "Point 2" },
          { id: "3", value: 10, tooltipLabel: "Point 3" },
        ],
      },
      global,
    });
    const negPath = negWrapper.find(".trend-path");
    expect(negPath.classes()).toContain("negative");
  });

  it("assigns win/hit/miss classes based on winThreshold", () => {
    const wrapper = mount(BaseHistoryChart, {
      props: {
        ...defaultProps,
        data: [
          { id: "miss", value: 0, tooltipLabel: "Miss" },
          { id: "hit", value: 40, tooltipLabel: "Hit" },
          { id: "win", value: 80, tooltipLabel: "Win" },
        ],
        winThreshold: 75,
      },
      global,
    });

    const bars = wrapper.findAll(".bar");
    expect(bars[0].classes()).toContain("bar-miss");
    expect(bars[1].classes()).toContain("bar-hit");
    expect(bars[2].classes()).toContain("bar-win");
  });

  it("renders projection bar and dot when provided", () => {
    const wrapper = mount(BaseHistoryChart, {
      props: {
        ...defaultProps,
        projection: { value: 90, tooltipLabel: "Projected" },
      },
      global,
    });

    // 3 actual bars + 1 projection bar
    expect(wrapper.findAll(".bar")).toHaveLength(4);
    expect(wrapper.find(".bar-projected").exists()).toBe(true);
    expect(wrapper.find(".chart-dot.projected").exists()).toBe(true);
  });

  it("renders loading state with skeleton bars", () => {
    const wrapper = mount(BaseHistoryChart, {
      props: {
        ...defaultProps,
        loading: true,
      },
      global,
    });

    expect(wrapper.find(".skeleton-anim").exists()).toBe(true);
    expect(wrapper.findAll(".sk-chart-bar")).toHaveLength(10);
    expect(wrapper.find(".base-chart").exists()).toBe(false);
  });

  it("renders empty state when data is empty", () => {
    const wrapper = mount(BaseHistoryChart, {
      props: {
        ...defaultProps,
        data: [],
      },
      global,
    });

    expect(wrapper.text()).toContain("No history");
    expect(wrapper.find(".base-chart").exists()).toBe(false);
  });
});
