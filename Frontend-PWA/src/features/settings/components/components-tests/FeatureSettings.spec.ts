// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { mount } from "@vue/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { reactive, defineComponent, ref } from "vue";
import FeatureSettings from "../FeatureSettings.vue";
import * as useSettingsModule from "../../composables/useSettings";

// Deep import mock per ADR to avoid barrel side effects
vi.mock("../../composables/useSettings", () => ({
  useSettings: vi.fn()
}));

// Functional stubs to allow prop inspection
const SettingsCardStub = defineComponent({
  name: "SettingsCard",
  props: ["title", "icon", "loading", "initiallyExpanded"],
  template: '<div class="settings-card-stub"><slot /></div>'
});

const SettingRowStub = defineComponent({
  name: "SettingRow",
  props: ["label", "description", "active", "loading"],
  template: '<div class="setting-row-stub" @click="$emit(\'click\')"></div>'
});

describe("FeatureSettings.vue", () => {
  const mockModules = reactive({
    ghostBenchmarking: false,
    sortExplanation: true
  });
  const mockIsRefreshing = ref(false);
  const mockToggle = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockModules.ghostBenchmarking = false;
    mockModules.sortExplanation = true;
    mockIsRefreshing.value = false;

    vi.mocked(useSettingsModule.useSettings).mockReturnValue({
      modules: mockModules,
      toggle: mockToggle,
      isRefreshing: mockIsRefreshing
    } as any);
  });

  const mountComponent = (props = {}) => {
    return mount(FeatureSettings, {
      props,
      global: {
        stubs: {
          SettingsCard: SettingsCardStub,
          SettingRow: SettingRowStub
        }
      }
    });
  };

  it("renders the settings card with correct props", () => {
    const wrapper = mountComponent({ initiallyExpanded: true });
    const card = wrapper.findComponent(SettingsCardStub);

    expect(card.exists()).toBe(true);
    expect(card.props("title")).toBe("Application Features");
    expect(card.props("icon")).toBe("analytics");
    expect(card.props("initiallyExpanded")).toBe(true);
  });

  it("renders all feature setting rows", () => {
    const wrapper = mountComponent();
    const rows = wrapper.findAllComponents(SettingRowStub);

    expect(rows).toHaveLength(2);
    expect(rows[0].props("label")).toBe("Ghost Benchmarking");
    expect(rows[1].props("label")).toBe("Sorting Descriptions");
  });

  it("synchronizes row active state with modules", () => {
    const wrapper = mountComponent();
    const rows = wrapper.findAllComponents(SettingRowStub);

    expect(rows[0].props("active")).toBe(false); // ghostBenchmarking
    expect(rows[1].props("active")).toBe(true);  // sortExplanation
  });

  it("calls toggle with correct module name when a row is clicked", async () => {
    const wrapper = mountComponent();
    const rows = wrapper.findAllComponents(SettingRowStub);

    await rows[0].trigger("click");
    expect(mockToggle).toHaveBeenCalledWith("ghostBenchmarking");

    await rows[1].trigger("click");
    expect(mockToggle).toHaveBeenCalledWith("sortExplanation");
  });

  it("passes isRefreshing state to card and rows", async () => {
    const wrapper = mountComponent();

    mockIsRefreshing.value = true;
    await wrapper.vm.$nextTick();

    const card = wrapper.findComponent(SettingsCardStub);
    expect(card.props("loading")).toBe(true);

    const rows = wrapper.findAllComponents(SettingRowStub);
    expect(rows[0].props("loading")).toBe(true);
    expect(rows[1].props("loading")).toBe(true);
  });
});
