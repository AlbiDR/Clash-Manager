// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment jsdom
 *
 * SPEC: BenchmarkPanel.vue
 *
 * Covers:
 *  1. Header and tier slug calculation: lowercase and whitespace-to-hyphen replacement,
 *     and appropriate CSS class binding (.tier-*).
 *  2. Sentiment and delta string formatting: positive '+' prefix vs '-' prefix,
 *     and sentiment class binding on .bc-marker-player and .bc-delta.
 *  3. Range track and position markers: player and average position calculations,
 *     clampPercent boundary conditions (under 0% and over 100%), and zero-range fallback safety.
 *  4. Metric formatting: standard number rounding, percentage formatting, and
 *     durationMinutes relative time formatting across avg, min, and max bounds.
 *
 * Isolation: presentational component tested in jsdom without store or global state dependencies.
 */

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import BenchmarkPanel from "../BenchmarkPanel.vue";
import type { BenchmarkData } from "../../../core";

const createBenchmarkData = (overrides: Partial<BenchmarkData> = {}): BenchmarkData => ({
  label: "Clan War Attacks",
  tier: "ELITE",
  value: 4,
  avg: 3.2,
  min: 0,
  max: 4,
  percent: 25,
  isBetter: true,
  ...overrides,
});

describe("BenchmarkPanel.vue -- Header and Tier Formatting", () => {
  it("renders the label and tier text correctly", () => {
    const wrapper = mount(BenchmarkPanel, {
      props: {
        data: createBenchmarkData({ label: "Donation Rate", tier: "TOP TIER" }),
      },
    });

    expect(wrapper.find(".bc-label").text()).toBe("Donation Rate");
    expect(wrapper.find(".bc-tier").text()).toBe("TOP TIER");
    expect(wrapper.find(".bc-tier").classes()).toContain("tier-top-tier");
  });

  it("converts multiple spaces to single hyphens in tierSlug", () => {
    const wrapper = mount(BenchmarkPanel, {
      props: {
        data: createBenchmarkData({ tier: "VERY  HIGH   TIER" }),
      },
    });

    expect(wrapper.find(".bc-tier").classes()).toContain("tier-very-high-tier");
  });
});

describe("BenchmarkPanel.vue -- Sentiment and Delta Formatting", () => {
  it("renders positive delta and better sentiment classes when isBetter is true", () => {
    const wrapper = mount(BenchmarkPanel, {
      props: {
        data: createBenchmarkData({ isBetter: true, percent: 42 }),
      },
    });

    const deltaEl = wrapper.find(".bc-delta");
    expect(deltaEl.classes()).toContain("better");
    expect(deltaEl.classes()).not.toContain("worse");
    expect(deltaEl.text()).toBe("+42%");

    const playerMarker = wrapper.find(".bc-marker-player");
    expect(playerMarker.classes()).toContain("better");
  });

  it("renders negative delta and worse sentiment classes when isBetter is false", () => {
    const wrapper = mount(BenchmarkPanel, {
      props: {
        data: createBenchmarkData({ isBetter: false, percent: 18 }),
      },
    });

    const deltaEl = wrapper.find(".bc-delta");
    expect(deltaEl.classes()).toContain("worse");
    expect(deltaEl.classes()).not.toContain("better");
    expect(deltaEl.text()).toBe("-18%");

    const playerMarker = wrapper.find(".bc-marker-player");
    expect(playerMarker.classes()).toContain("worse");
  });
});

describe("BenchmarkPanel.vue -- Track Positioning and Clamping", () => {
  it("calculates player and average marker positions accurately", () => {
    // min = 100, max = 500 => range = 400
    // value = 300 => (300 - 100) / 400 * 100 = 50%
    // avg = 200 => (200 - 100) / 400 * 100 = 25%
    const wrapper = mount(BenchmarkPanel, {
      props: {
        data: createBenchmarkData({ min: 100, max: 500, value: 300, avg: 200 }),
      },
    });

    const playerMarker = wrapper.find(".bc-marker-player");
    expect(playerMarker.attributes("style")).toContain("left: 50%");

    const avgMarker = wrapper.find(".bc-marker-avg");
    expect(avgMarker.attributes("style")).toContain("left: 25%");
  });

  it("clamps playerPosition to 0% when value is below min", () => {
    const wrapper = mount(BenchmarkPanel, {
      props: {
        data: createBenchmarkData({ min: 50, max: 100, value: 10 }),
      },
    });

    const playerMarker = wrapper.find(".bc-marker-player");
    expect(playerMarker.attributes("style")).toContain("left: 0%");
  });

  it("clamps playerPosition to 100% when value exceeds max", () => {
    const wrapper = mount(BenchmarkPanel, {
      props: {
        data: createBenchmarkData({ min: 50, max: 100, value: 150 }),
      },
    });

    const playerMarker = wrapper.find(".bc-marker-player");
    expect(playerMarker.attributes("style")).toContain("left: 100%");
  });

  it("handles zero range without NaN or crash using fallback divisor", () => {
    const wrapper = mount(BenchmarkPanel, {
      props: {
        data: createBenchmarkData({ min: 20, max: 20, value: 20, avg: 20 }),
      },
    });

    const playerMarker = wrapper.find(".bc-marker-player");
    expect(playerMarker.attributes("style")).toContain("left: 0%");

    const avgMarker = wrapper.find(".bc-marker-avg");
    expect(avgMarker.attributes("style")).toContain("left: 0%");
  });
});

describe("BenchmarkPanel.vue -- Domain Value Formatting", () => {
  it("formats standard integer numbers with rounding", () => {
    const wrapper = mount(BenchmarkPanel, {
      props: {
        data: createBenchmarkData({
          avg: 1234.6,
          min: 100,
          max: 2000,
          format: "number",
        }),
      },
    });

    expect(wrapper.find(".bc-stat").text()).toBe("AVG 1,235");
    const bounds = wrapper.findAll(".bc-bound");
    expect(bounds[0].text()).toContain("100");
    expect(bounds[1].text()).toContain("2,000");
  });

  it("formats percent values with percent style", () => {
    const wrapper = mount(BenchmarkPanel, {
      props: {
        data: createBenchmarkData({
          avg: 0.685,
          min: 0.1,
          max: 1.0,
          format: "percent",
        }),
      },
    });

    expect(wrapper.find(".bc-stat").text()).toBe("AVG 68.5%");
    const bounds = wrapper.findAll(".bc-bound");
    expect(bounds[0].text()).toContain("10%");
    expect(bounds[1].text()).toContain("100%");
  });

  it("formats durationMinutes values using relative time", () => {
    const wrapper = mount(BenchmarkPanel, {
      props: {
        data: createBenchmarkData({
          avg: 60,
          min: 15,
          max: 120,
          format: "durationMinutes",
        }),
      },
    });

    expect(wrapper.find(".bc-stat").text()).toBe("AVG 1h ago");
    const bounds = wrapper.findAll(".bc-bound");
    expect(bounds[0].text()).toContain("15m ago");
    expect(bounds[1].text()).toContain("2h ago");
  });
});
