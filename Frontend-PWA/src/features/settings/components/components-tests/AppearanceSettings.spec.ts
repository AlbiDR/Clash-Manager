// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { mount } from "@vue/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AppearanceSettings from "../AppearanceSettings.vue";
import { ref } from "vue";
import * as useSettingsModule from "../../composables/useSettings";

// Deep import mock per ADR to avoid barrel side effects
vi.mock("../../composables/useSettings", () => ({
  useSettings: vi.fn()
}));

describe("AppearanceSettings.vue", () => {
  const mockTheme = ref("auto");
  const mockIsRefreshing = ref(false);
  const mockWakeLock = {
    isSupported: true,
    isActive: ref(false),
    toggle: vi.fn()
  };
  const mockHandleThemeChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockTheme.value = "auto";
    mockIsRefreshing.value = false;
    mockWakeLock.isActive.value = false;
    mockWakeLock.isSupported = true;

    vi.mocked(useSettingsModule.useSettings).mockReturnValue({
      theme: mockTheme,
      isRefreshing: mockIsRefreshing,
      wakeLock: mockWakeLock,
      handleThemeChange: mockHandleThemeChange
    } as any);
  });

  it("renders with correct active theme button", () => {
    const wrapper = mount(AppearanceSettings, {
      global: {
        stubs: {
          Icon: true,
          SettingRow: true,
          SettingsCard: {
            template: '<div class="settings-card-stub"><slot /></div>',
            props: ['title', 'icon', 'initiallyExpanded']
          }
        }
      }
    });

    const autoOption = wrapper.find('button[aria-label="Auto Theme"]');
    expect(autoOption.classes()).toContain("active");

    const lightOption = wrapper.find('button[aria-label="Light Theme"]');
    expect(lightOption.classes()).not.toContain("active");
  });

  it("calls handleThemeChange when a theme option is clicked", async () => {
    const wrapper = mount(AppearanceSettings, {
      global: {
        stubs: {
          Icon: true,
          SettingRow: true,
          SettingsCard: {
            template: '<div class="settings-card-stub"><slot /></div>'
          }
        }
      }
    });

    await wrapper.find('button[aria-label="Light Theme"]').trigger("click");
    expect(mockHandleThemeChange).toHaveBeenCalledWith("light");
  });

  it("renders Wake Lock setting if supported", () => {
    const wrapper = mount(AppearanceSettings, {
      global: {
        stubs: {
          Icon: true,
          SettingsCard: {
            template: '<div class="settings-card-stub"><slot /></div>'
          },
          SettingRow: {
            template: '<div class="setting-row-stub" @click="$emit(\'click\')">{{ label }}</div>',
            props: ['label', 'description', 'active', 'loading']
          }
        }
      }
    });

    const wakeLockRow = wrapper.find(".setting-row-stub");
    expect(wakeLockRow.exists()).toBe(true);
    expect(wakeLockRow.text()).toBe("Keep Screen On");
  });

  it("toggles wake lock when row is clicked", async () => {
    const wrapper = mount(AppearanceSettings, {
      global: {
        stubs: {
          Icon: true,
          SettingsCard: {
            template: '<div class="settings-card-stub"><slot /></div>'
          },
          SettingRow: {
            template: '<div class="setting-row-stub" @click="$emit(\'click\')"></div>',
            props: ['label', 'description', 'active', 'loading']
          }
        }
      }
    });

    await wrapper.find(".setting-row-stub").trigger("click");
    expect(mockWakeLock.toggle).toHaveBeenCalled();
  });

  it("does not render Wake Lock setting if not supported", () => {
    mockWakeLock.isSupported = false;
    const wrapper = mount(AppearanceSettings, {
      global: {
        stubs: {
          Icon: true,
          SettingRow: {
            template: '<div class="setting-row-stub"></div>',
            props: ['label', 'description', 'active', 'loading']
          },
          SettingsCard: {
            template: '<div class="settings-card-stub"><slot /></div>'
          }
        }
      }
    });

    expect(wrapper.find(".setting-row-stub").exists()).toBe(false);
  });
});
