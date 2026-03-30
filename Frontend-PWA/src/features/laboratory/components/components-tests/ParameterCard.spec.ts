// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ParameterCard from "../ParameterCard.vue";
import { type OptimizationSettings } from "../../logic";

describe("ParameterCard.vue", () => {
  const defaultSettings: OptimizationSettings = {
    strategy: "Level Projection",
    allowGemSpending: false,
    infiniteResources: false,
    targetLevel: 90
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
    expect(wrapper.find(".strategy-btn.active").text()).toBe("Level Projection");
    expect(wrapper.find(".level-select").exists()).toBe(true);
  });

  it("emits update when a new strategy is selected", async () => {
    const wrapper = createWrapper();
    const strategyBtns = wrapper.findAll(".strategy-btn");

    // Find the Resource Efficiency button
    const resourceBtn = strategyBtns.find(btn => btn.text() === "Resource Efficiency");
    await resourceBtn?.trigger("click");

    expect(wrapper.emitted("update")).toBeTruthy();
    expect(wrapper.emitted("update")![0]).toEqual([{
      ...defaultSettings,
      strategy: "Resource Efficiency"
    }]);
  });

  it("emits update when target level is changed", async () => {
    const wrapper = createWrapper();
    const select = wrapper.find(".level-select");

    await select.setValue("15");

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
    expect(wrapper.find(".level-select").exists()).toBe(false);
  });

  it("filters levels correctly in the select dropdown", () => {
    const currentLevel = 50;
    const wrapper = createWrapper({ currentLevel });
    const options = wrapper.findAll("option");

    // IMPORTANT_KING_LEVELS = [2, 3, 5, 7, 10, 14, 18, 22, 26, 30, 34, 38, 42, 54, 75]
    // For currentLevel 50:
    // level 14, 42: past milestone -> shown
    // level 51-90: future -> shown
    // level 50: NOT a milestone and NOT > 50 -> NOT shown

    const shownLevels = options.map(o => parseInt(o.element.value));
    expect(shownLevels).toContain(14);
    expect(shownLevels).toContain(42);
    expect(shownLevels).toContain(54); // Milestone > 50
    expect(shownLevels).toContain(51); // Future level
    expect(shownLevels).toContain(90); // Max level

    expect(shownLevels).not.toContain(50); // Not a milestone
    expect(shownLevels).not.toContain(13); // Not a milestone and < 50

    // Check if past levels are disabled
    const level14Option = options.find(o => o.element.value === "14");
    expect(level14Option?.element.disabled).toBe(true);

    const level51Option = options.find(o => o.element.value === "51");
    expect(level51Option?.element.disabled).toBe(false);
  });
});
