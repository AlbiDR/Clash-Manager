// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ScoreCompositionPanel from "../ScoreCompositionPanel.vue";
import type { ScoreExplanationData } from "@core/services/useBenchmarking";

const data: ScoreExplanationData = {
  kind: "score", name: "Player", context: "lb", score: 50, comparison: null,
  composition: {
    contributions: [{ key: "current_fame", points: 10.4 }, { key: "donations", points: 10.4 }],
    adjustments: [{ key: "inactivity", points: -1.8, factor: 0.9 }],
    rawScore: 19, normalizedScore: 50, scoreBonus: 1, referenceScore: 40,
    referenceScope: "clan", stability: 0.8,
  },
};

describe("ScoreCompositionPanel", () => {
  it("keeps the receipt scannable and makes rounded rows visibly reconcile", () => {
    const wrapper = mount(ScoreCompositionPanel, { props: { data } });
    expect(wrapper.find("details").attributes("open")).toBeUndefined();
    expect(wrapper.find(".score-composition__rounding").text()).toContain("+1");
    expect(wrapper.find(".score-composition__total").text()).toContain("19");
    expect(wrapper.findAll(".score-composition__terms")[0].text()).toContain("Daily donations");
    expect(wrapper.find(".score-composition__terms--adjustments").text()).toContain("-2");
  });

  it("explains the bonus after the raw score and identifies the actual reference scope", () => {
    const wrapper = mount(ScoreCompositionPanel, {
      props: { data: { ...data, context: "hh", composition: { ...data.composition, referenceScope: "recruitment" } } },
    });
    expect(wrapper.text()).toContain("Lifetime donations");
    expect(wrapper.text()).toContain("Returning veteran bonus");
    expect(wrapper.text()).toContain("queued and unexpired dismissed profiles");
    expect(wrapper.text()).toContain("capped at 100");
    expect(wrapper.text()).toContain("RPoS");
  });
  it("does not describe a division by zero for an empty scoring reference", () => {
    const wrapper = mount(ScoreCompositionPanel, {
      props: { data: { ...data, score: 0, composition: { ...data.composition, referenceScore: 0, normalizedScore: 0 } } },
    });
    expect(wrapper.text()).toContain("A positive comparison reference is not available");
    expect(wrapper.text()).not.toContain("divided by this reference");
  });

  it("reconciles a fractional bonus with the rounded combined score", () => {
    const wrapper = mount(ScoreCompositionPanel, {
      props: { data: { ...data, composition: { ...data.composition, rawScore: 19.6, scoreBonus: 0.6 } } },
    });
    expect(wrapper.findAll(".score-composition__explanation .score-composition__row")[1].text()).toBe("Rounding-1");
    expect(wrapper.findAll(".score-composition__explanation .score-composition__row")[2].text()).toBe("Combined score20");
  });

});
