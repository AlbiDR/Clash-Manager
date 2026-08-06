// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment jsdom
 *
 * SPEC: BenchmarkContent.vue
 *
 * Covers the two rendering branches of the presentational component:
 *  1. Simple string mode (no-newline and label+value newline variants).
 *  2. BenchmarkData mode: all four tiers, better/worse sentiments, delta
 *     sign prefix, range-track positioning, and clamp edge cases.
 *
 * Isolation: no external composables, no stores, no directives required.
 */

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import BenchmarkContent from "../BenchmarkContent.vue";
import type { BenchmarkData } from "../../../core";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const makeData = (overrides: Partial<BenchmarkData> = {}): BenchmarkData => ({
  label: "Trophies",
  tier: "ELITE",
  value: 8_000,
  avg: 6_000,
  min: 2_000,
  max: 10_000,
  percent: 33,
  isBetter: true,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Describe: simple string mode
// ---------------------------------------------------------------------------

describe("BenchmarkContent.vue -- simple string mode", () => {
  it("renders a plain string with no newline as .bc-simple", () => {
    const wrapper = mount(BenchmarkContent, {
      props: { data: "Quick label" },
    });

    expect(wrapper.find(".bc-simple").exists()).toBe(true);
    expect(wrapper.find(".bc-simple").text()).toBe("Quick label");
    expect(wrapper.find(".bc-simple-rich").exists()).toBe(false);
    expect(wrapper.find(".bc-panel").exists()).toBe(false);
  });

  it("renders a two-line string as .bc-simple-rich with label and value spans", () => {
    const wrapper = mount(BenchmarkContent, {
      props: { data: "Win Rate\n73%" },
    });

    expect(wrapper.find(".bc-simple-rich").exists()).toBe(true);
    expect(wrapper.find(".bc-simple-label").text()).toBe("Win Rate");
    expect(wrapper.find(".bc-simple-value").text()).toBe("73%");
    expect(wrapper.find(".bc-simple").exists()).toBe(false);
  });

  it("uses the first two lines of a string with more than two newline segments", () => {
    // The component only reads simpleLines[0] and simpleLines[1]; extra lines are ignored.
    const wrapper = mount(BenchmarkContent, {
      props: { data: "Label\nValue\nExtra" },
    });

    expect(wrapper.find(".bc-simple-rich").exists()).toBe(true);
    expect(wrapper.find(".bc-simple-label").text()).toBe("Label");
    expect(wrapper.find(".bc-simple-value").text()).toBe("Value");
  });

  it("treats an empty string as .bc-simple (one segment, length is not > 1)", () => {
    const wrapper = mount(BenchmarkContent, {
      props: { data: "" },
    });

    expect(wrapper.find(".bc-simple").exists()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Describe: BenchmarkData mode -- header and tier badge
// ---------------------------------------------------------------------------

describe("BenchmarkContent.vue -- BenchmarkData: header and tier", () => {
  it("renders the .bc-panel when data is a BenchmarkData object", () => {
    const wrapper = mount(BenchmarkContent, { props: { data: makeData() } });

    expect(wrapper.find(".bc-panel").exists()).toBe(true);
    expect(wrapper.find(".bc-simple").exists()).toBe(false);
    expect(wrapper.find(".bc-simple-rich").exists()).toBe(false);
  });

  it("renders the label text in .bc-label", () => {
    const wrapper = mount(BenchmarkContent, {
      props: { data: makeData({ label: "Trophy Rank" }) },
    });

    expect(wrapper.find(".bc-label").text()).toBe("Trophy Rank");
  });

  it("applies tier-elite class for ELITE tier", () => {
    const wrapper = mount(BenchmarkContent, {
      props: { data: makeData({ tier: "ELITE" }) },
    });

    expect(wrapper.find(".bc-tier").classes()).toContain("tier-elite");
    expect(wrapper.find(".bc-tier").text()).toBe("ELITE");
  });

  it("applies tier-top-tier class for TOP TIER tier (space becomes hyphen)", () => {
    const wrapper = mount(BenchmarkContent, {
      props: { data: makeData({ tier: "TOP TIER" }) },
    });

    expect(wrapper.find(".bc-tier").classes()).toContain("tier-top-tier");
    expect(wrapper.find(".bc-tier").text()).toBe("TOP TIER");
  });

  it("applies tier-growing class for GROWING tier", () => {
    const wrapper = mount(BenchmarkContent, {
      props: { data: makeData({ tier: "GROWING" }) },
    });

    expect(wrapper.find(".bc-tier").classes()).toContain("tier-growing");
  });

  it("applies tier-under class for UNDER tier", () => {
    const wrapper = mount(BenchmarkContent, {
      props: { data: makeData({ tier: "UNDER" }) },
    });

    expect(wrapper.find(".bc-tier").classes()).toContain("tier-under");
  });
});

// ---------------------------------------------------------------------------
// Describe: BenchmarkData mode -- sentiment (better / worse)
// ---------------------------------------------------------------------------

describe("BenchmarkContent.vue -- BenchmarkData: sentiment", () => {
  it("adds the better class and positive delta prefix when isBetter is true", () => {
    const wrapper = mount(BenchmarkContent, {
      props: { data: makeData({ isBetter: true, percent: 25 }) },
    });

    expect(wrapper.find(".bc-delta").classes()).toContain("better");
    expect(wrapper.find(".bc-delta").text()).toBe("+25%");
    expect(wrapper.find(".bc-marker-player").classes()).toContain("better");
  });

  it("adds the worse class and negative delta prefix when isBetter is false", () => {
    const wrapper = mount(BenchmarkContent, {
      props: { data: makeData({ isBetter: false, percent: 15 }) },
    });

    expect(wrapper.find(".bc-delta").classes()).toContain("worse");
    expect(wrapper.find(".bc-delta").text()).toBe("-15%");
    expect(wrapper.find(".bc-marker-player").classes()).toContain("worse");
  });

  it("renders delta as +0% when percent is zero and isBetter is true", () => {
    const wrapper = mount(BenchmarkContent, {
      props: { data: makeData({ isBetter: true, percent: 0 }) },
    });

    expect(wrapper.find(".bc-delta").text()).toBe("+0%");
  });
});

// ---------------------------------------------------------------------------
// Describe: BenchmarkData mode -- range track and position markers
// ---------------------------------------------------------------------------

describe("BenchmarkContent.vue -- BenchmarkData: track positioning", () => {
  it("positions the player marker at 50% when value is the midpoint of the range", () => {
    // value=6000, min=2000, max=10000 => (6000-2000)/(10000-2000)*100 = 50%
    const wrapper = mount(BenchmarkContent, {
      props: { data: makeData({ value: 6_000, min: 2_000, max: 10_000 }) },
    });

    const playerMarker = wrapper.find(".bc-marker-player");
    expect(playerMarker.attributes("style")).toContain("left: 50%");
  });

  it("positions the average marker correctly relative to min/max", () => {
    // avg=5000, min=0, max=10000 => 50%
    const wrapper = mount(BenchmarkContent, {
      props: { data: makeData({ avg: 5_000, min: 0, max: 10_000 }) },
    });

    const avgMarker = wrapper.find(".bc-marker-avg");
    expect(avgMarker.attributes("style")).toContain("left: 50%");
  });

  it("clamps player position to 0% when value is below min", () => {
    // value < min should clamp to 0
    const wrapper = mount(BenchmarkContent, {
      props: { data: makeData({ value: 0, min: 5_000, max: 10_000 }) },
    });

    const playerMarker = wrapper.find(".bc-marker-player");
    expect(playerMarker.attributes("style")).toContain("left: 0%");
  });

  it("clamps player position to 100% when value is above max", () => {
    // value > max should clamp to 100
    const wrapper = mount(BenchmarkContent, {
      props: { data: makeData({ value: 15_000, min: 0, max: 10_000 }) },
    });

    const playerMarker = wrapper.find(".bc-marker-player");
    expect(playerMarker.attributes("style")).toContain("left: 100%");
  });

  it("uses a safe divisor of 1 when min equals max (zero-range guard)", () => {
    // Prevents division by zero: range = max - min = 0, falls back to 1.
    // With value=5000, min=5000, max=5000 => (5000-5000)/1 * 100 = 0%
    const wrapper = mount(BenchmarkContent, {
      props: { data: makeData({ value: 5_000, min: 5_000, max: 5_000 }) },
    });

    const playerMarker = wrapper.find(".bc-marker-player");
    // The result is 0% because numerator is 0; crucially, no NaN or crash.
    expect(playerMarker.attributes("style")).toContain("left: 0%");
  });
});

// ---------------------------------------------------------------------------
// Describe: BenchmarkData mode -- footer (AVG and bounds)
// ---------------------------------------------------------------------------

describe("BenchmarkContent.vue -- BenchmarkData: footer values", () => {
  it("renders the AVG formatted value in the footer", () => {
    // avg=6000 => Math.round(6000) => formatNumber => "6,000"
    const wrapper = mount(BenchmarkContent, {
      props: { data: makeData({ avg: 6_000 }) },
    });

    expect(wrapper.find(".bc-stat").text()).toContain("6,000");
  });

  it("renders MIN and MAX formatted values in .bc-bounds", () => {
    const wrapper = mount(BenchmarkContent, {
      props: { data: makeData({ min: 1_000, max: 12_000 }) },
    });

    const bounds = wrapper.findAll(".bc-bound");
    expect(bounds[0].text()).toContain("1,000");
    expect(bounds[1].text()).toContain("12,000");
  });

  it("rounds fractional avg before formatting", () => {
    // avg=6000.7 => Math.round => 6001 => "6,001"
    const wrapper = mount(BenchmarkContent, {
      props: { data: makeData({ avg: 6_000.7 }) },
    });

    expect(wrapper.find(".bc-stat").text()).toContain("6,001");
  });
});
