// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { mount } from "@vue/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ModeSettings from "../ModeSettings.vue";
import { ref } from "vue";
import * as useSettingsModule from "../../composables/useSettings";

// Deep import mock per ADR to avoid barrel side effects
vi.mock("../../composables/useSettings", () => ({
  useSettings: vi.fn()
}));

describe("ModeSettings.vue", () => {
  const isSyntheticMode = ref(false);
  const isBlueprintMode = ref(false);
  const isShowcaseMode = ref(false);
  const isRefreshing = ref(false);

  const toggleSyntheticMode = vi.fn();
  const toggleBlueprintMode = vi.fn();
  const toggleShowcaseMode = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    isSyntheticMode.value = false;
    isBlueprintMode.value = false;
    isShowcaseMode.value = false;
    isRefreshing.value = false;

    vi.mocked(useSettingsModule.useSettings).mockReturnValue({
      isSyntheticMode,
      toggleSyntheticMode,
      isBlueprintMode,
      toggleBlueprintMode,
      isShowcaseMode,
      toggleShowcaseMode,
      isRefreshing
    } as any);
  });

  const mountComponent = (props = {}) => {
    return mount(ModeSettings, {
      props: {
        initiallyExpanded: true,
        ...props
      },
      global: {
        stubs: {
          Icon: true,
          SettingsCard: {
            name: 'SettingsCard',
            template: '<div class="settings-card-stub"><slot /></div>',
            props: ['title', 'icon', 'loading', 'initiallyExpanded']
          },
          SettingRow: {
            name: 'SettingRow',
            template: '<div class="setting-row-stub" @click="$emit(\'click\')"><slot name="label" /><slot name="description" /></div>',
            props: ['label', 'description', 'active', 'disabled', 'mini']
          }
        }
      }
    });
  };

  it("renders all setting rows with correct labels", () => {
    const wrapper = mountComponent();
    const rows = wrapper.findAllComponents({ name: 'SettingRow' });

    expect(rows.length).toBe(3);
    // Check labels (either via prop or slot)
    expect(rows[0].props('label')).toBe("Synthetic Engine");
    expect(rows[1].props('label')).toBe("Structural Blueprint");
    // Master Showcase uses slot for label
    expect(rows[2].text()).toContain("Master Showcase");
  });

  it("reflects reactive states from useSettings", () => {
    isSyntheticMode.value = true;
    const wrapper = mountComponent();
    const rows = wrapper.findAllComponents({ name: 'SettingRow' });

    expect(rows[0].props('active')).toBe(true);
    expect(rows[1].props('active')).toBe(false);
    expect(rows[2].props('active')).toBe(false);
  });

  it("calls toggle functions when rows are clicked", async () => {
    const wrapper = mountComponent();
    const rows = wrapper.findAllComponents({ name: 'SettingRow' });

    await rows[0].trigger("click");
    expect(toggleSyntheticMode).toHaveBeenCalled();

    await rows[1].trigger("click");
    expect(toggleBlueprintMode).toHaveBeenCalled();

    await rows[2].trigger("click");
    expect(toggleShowcaseMode).toHaveBeenCalled();
  });

  it("disables Synthetic and Blueprint rows when Showcase Mode is active", () => {
    isShowcaseMode.value = true;
    const wrapper = mountComponent();
    const rows = wrapper.findAllComponents({ name: 'SettingRow' });

    expect(rows[0].props('disabled')).toBe(true);
    expect(rows[1].props('disabled')).toBe(true);
    expect(rows[2].props('active')).toBe(true);
  });

  it("shows HYBRID badge only when Showcase Mode is active", async () => {
    let wrapper = mountComponent();
    expect(wrapper.find(".hybrid-badge").exists()).toBe(false);

    isShowcaseMode.value = true;
    wrapper = mountComponent();
    expect(wrapper.find(".hybrid-badge").exists()).toBe(true);
    expect(wrapper.find(".hybrid-badge").text()).toBe("HYBRID");
  });

  it("applies active class to master container when Showcase Mode is active", () => {
    const wrapper = mountComponent();
    expect(wrapper.find(".mode-master-container").classes()).not.toContain("active");

    isShowcaseMode.value = true;
    const wrapperActive = mountComponent();
    expect(wrapperActive.find(".mode-master-container").classes()).toContain("active");
  });

  it("passes loading state to SettingsCard", () => {
    isRefreshing.value = true;
    const wrapper = mountComponent();
    const card = wrapper.findComponent({ name: 'SettingsCard' });
    expect(card.props('loading')).toBe(true);
  });
});
