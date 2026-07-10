// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import ScoreThresholdSelector from "../ScoreThresholdSelector.vue";

const { mockTap, mockMedium } = vi.hoisted(() => ({
  mockTap: vi.fn(),
  mockMedium: vi.fn(),
}));

vi.mock("@shared/composables/useHaptics", () => ({
  useHaptics: () => ({
    tap: mockTap,
    medium: mockMedium,
    heavy: vi.fn(),
  }),
}));

vi.mock("@core", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    SCORE_SELECTION_STEPS: [15, 30, 45, 60, 75, 90, 100],
  };
});

describe("ScoreThresholdSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock scrollTo since JSDOM doesn't implement it
    Element.prototype.scrollTo = vi.fn();
  });

  it("renders correctly in initial state", () => {
    const wrapper = mount(ScoreThresholdSelector, {
      props: { mode: "ge", value: 75 },
    });

    expect(wrapper.find(".mode-symbol").text()).toBe("≥");
    expect(wrapper.find(".sp-label").text()).toBe("75");
    expect(wrapper.find(".value-picker").exists()).toBe(false);
  });

  it("toggles mode when clicked", async () => {
    const wrapper = mount(ScoreThresholdSelector, {
      props: { mode: "ge", value: 75 },
    });

    const modeBtn = wrapper.find(".mode-toggle");
    await modeBtn.trigger("click");

    expect(wrapper.emitted("update:mode")![0]).toEqual(["le"]);
    expect(wrapper.emitted("select")![0]).toEqual([75, "le"]);
  });

  it("toggles expansion when trigger is clicked", async () => {
    const wrapper = mount(ScoreThresholdSelector, {
      props: { mode: "ge", value: 75 },
    });

    const trigger = wrapper.find(".sp-trigger");
    await trigger.trigger("click");

    expect(wrapper.find(".value-picker").exists()).toBe(true);
    expect(wrapper.find(".score-pill-group").classes()).toContain("expanded");
    expect(wrapper.vm.isExpanded).toBe(true);

    await trigger.trigger("click");
    expect(wrapper.find(".value-picker").exists()).toBe(false);
    expect(wrapper.vm.isExpanded).toBe(false);
  });

  it("emits value selection", async () => {
    const wrapper = mount(ScoreThresholdSelector, {
      props: { mode: "ge", value: 75 },
    });

    // Expand first
    await wrapper.find(".sp-trigger").trigger("click");

    const options = wrapper.findAll(".val-opt");
    expect(options.length).toBe(7); // SCORE_SELECTION_STEPS length

    await options[0].trigger("click"); // val 15

    expect(wrapper.emitted("update:value")![0]).toEqual([15]);
    expect(wrapper.emitted("select")![0]).toEqual([15, "ge"]);
  });

  it("respects disabled prop", async () => {
    const wrapper = mount(ScoreThresholdSelector, {
      props: { mode: "ge", value: 75, disabled: true },
    });

    expect(wrapper.find(".score-pill-group").classes()).toContain("disabled");

    const modeBtn = wrapper.find(".mode-toggle");
    const trigger = wrapper.find(".sp-trigger");

    expect(modeBtn.attributes()).toHaveProperty("disabled");
    expect(trigger.attributes()).toHaveProperty("disabled");

    await modeBtn.trigger("click");
    expect(wrapper.emitted("update:mode")).toBeFalsy();

    await trigger.trigger("click");
    expect(wrapper.find(".value-picker").exists()).toBe(false);
  });

  it("displays correct symbol for le mode", () => {
    const wrapper = mount(ScoreThresholdSelector, {
      props: { mode: "le", value: 45 },
    });

    expect(wrapper.find(".mode-symbol").text()).toBe("≤");
  });
});
