// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ParameterCard from "../ParameterCard.vue";
import { type OptimizationSettings, type OptimizationResult } from "../../logic";

describe("ParameterCard.vue", () => {
  const defaultSettings: OptimizationSettings = {
    strategy: "Level Projection",
    allowGemSpending: false,
    infiniteResources: false,
    targetLevel: 90
  };

  const sampleOperation: OptimizationResult = {
    strategy: "Level Projection",
    steps: [],
    projectedKingLevel: 80,
    totalXpGained: 500000,
    goldRequired: 100000,
    gemsRequired: 500,
    feasible: false,
    summary: {
      initialLevel: 14,
      finalLevel: 80,
      xpNeeded: 1000000,
      cardsRequired: 200,
      goldRequired: 100000,
      gemsRequired: 500,
      goldDiff: -50000,
      gemsDiff: -200,
    }
  };

  const createWrapper = (props = {}) => {
    return mount(ParameterCard, {
      props: {
        settings: defaultSettings,
        currentLevel: 14,
        ...props
      },
      global: {
        stubs: {
          Icon: {
            template: '<i class="mock-icon" :name="name"></i>',
            props: ['name']
          },
          SettingRow: {
            name: 'SettingRow',
            template: '<div class="mock-setting-row" @click="$emit(\'click\')"><slot /></div>',
            props: ['label', 'description', 'active']
          }
        }
      }
    });
  };

  it("renders correctly with initial props", () => {
    const wrapper = createWrapper();
    expect(wrapper.find(".panel-header span").text()).toBe("Parameters");
    expect(wrapper.findComponent({ name: "BaseSegmentedControl" }).props("modelValue")).toBe("Level Projection");
    expect(wrapper.findComponent({ name: "BaseSelect" }).exists()).toBe(true);
  });

  it("emits update when a new strategy is selected", async () => {
    const wrapper = createWrapper();
    const segmentedControl = wrapper.findComponent({ name: "BaseSegmentedControl" });

    await segmentedControl.vm.$emit("update:modelValue", "Resource Efficiency");

    expect(wrapper.emitted("update")).toBeTruthy();
    expect(wrapper.emitted("update")![0]).toEqual([{
      strategy: "Resource Efficiency"
    }]);
  });

  it("emits update when target level is changed", async () => {
    const wrapper = createWrapper();
    const select = wrapper.findComponent({ name: "BaseSelect" });

    await select.vm.$emit("update:modelValue", 15);

    expect(wrapper.emitted("update")).toBeTruthy();
    expect(wrapper.emitted("update")![0]).toEqual([{
      targetLevel: 15
    }]);
  });

  it("emits update when Gem Spending is toggled", async () => {
    const wrapper = createWrapper();
    const settingRow = wrapper.findComponent({ name: 'SettingRow' });

    await settingRow.trigger("click");

    expect(wrapper.emitted("update")).toBeTruthy();
    expect(wrapper.emitted("update")![0]).toEqual([{
      allowGemSpending: true
    }]);
  });

  it("hides target level selector when strategy is Resource Efficiency", () => {
    const wrapper = createWrapper({
      settings: { ...defaultSettings, strategy: "Resource Efficiency" }
    });
    expect(wrapper.findComponent({ name: "BaseSelect" }).exists()).toBe(false);
  });

  it("filters levels correctly in the select dropdown options", () => {
    const currentLevel = 50;
    const wrapper = createWrapper({ currentLevel });
    const select = wrapper.findComponent({ name: "BaseSelect" });
    const options = select.props("options");

    // IMPORTANT_KING_LEVELS = [2, 3, 5, 7, 10, 14, 18, 22, 26, 30, 34, 38, 42, 46, 50, 54, 58, 62, 66, 70, 75, 80, 85, 90]
    // For currentLevel 50:
    // level 14, 42: past milestone -> shown
    // level 51-90: future -> shown
    // level 50: NOT a milestone and NOT > 50 -> NOT shown

    const shownLevels = options.map((o: any) => o.value);
    expect(shownLevels).toContain(14);
    expect(shownLevels).toContain(42);
    expect(shownLevels).toContain(54); // Milestone > 50
    expect(shownLevels).toContain(51); // Future level
    expect(shownLevels).toContain(90); // Max level

    expect(shownLevels).toContain(50); // Current level is now shown
    expect(shownLevels).not.toContain(49); // Not a milestone and < 50
    expect(shownLevels).not.toContain(13); // Not a milestone and < 50

    // Check if past levels are disabled
    const level14Option = options.find((o: any) => o.value === 14);
    expect(level14Option?.disabled).toBe(true);

    const level51Option = options.find((o: any) => o.value === 51);
    expect(level51Option?.disabled).toBe(false);
  });

  it("handles fallback to KING_LEVEL_MAX when targetLevel is null or undefined", () => {
    const settingsWithNoTarget: OptimizationSettings = {
      strategy: "Level Projection",
      allowGemSpending: false,
      infiniteResources: false,
      targetLevel: undefined
    };
    const wrapper = createWrapper({ settings: settingsWithNoTarget });
    const select = wrapper.findComponent({ name: "BaseSelect" });
    expect(select.props("modelValue")).toBe(90); // KING_LEVEL_MAX is 90
  });

  it("asserts levelOptions classes correctly for milestone and past states", () => {
    const currentLevel = 14;
    const wrapper = createWrapper({ currentLevel });
    const select = wrapper.findComponent({ name: "BaseSelect" });
    const options = select.props("options");

    // Level 10 is past milestone (< 14 and in IMPORTANT_KING_LEVELS)
    const option10 = options.find((o: any) => o.value === 10);
    expect(option10?.class).toBe("milestone past");

    // Level 15 is future non-milestone (> 14 and not in IMPORTANT_KING_LEVELS)
    const option15 = options.find((o: any) => o.value === 15);
    expect(option15?.class).toBe("");

    // Level 18 is future milestone (> 14 and in IMPORTANT_KING_LEVELS)
    const option18 = options.find((o: any) => o.value === 18);
    expect(option18?.class).toBe("milestone");
  });

  it("shows feasibility warning when operation is provided and projected level is less than target level", () => {
    const wrapper = createWrapper({
      settings: { ...defaultSettings, targetLevel: 90 },
      operation: sampleOperation // projectedKingLevel is 80, target is 90
    });

    const warning = wrapper.find(".limit-warning");
    expect(warning.exists()).toBe(true);
    expect(warning.text()).toContain("Cannot reach Level 90. Roster maxes out at 80.");
  });

  it("hides feasibility warning when projected level is equal to or greater than target level", () => {
    const wrapper = createWrapper({
      settings: { ...defaultSettings, targetLevel: 80 },
      operation: sampleOperation // projectedKingLevel is 80, target is 80
    });

    const warning = wrapper.find(".limit-warning");
    expect(warning.exists()).toBe(false);
  });

  it("hides feasibility warning when operation is undefined", () => {
    const wrapper = createWrapper({
      settings: { ...defaultSettings, targetLevel: 90 },
      operation: undefined
    });

    const warning = wrapper.find(".limit-warning");
    expect(warning.exists()).toBe(false);
  });
});
