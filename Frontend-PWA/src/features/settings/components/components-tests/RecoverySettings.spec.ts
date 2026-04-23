// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { mount } from "@vue/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import RecoverySettings from "../RecoverySettings.vue";
import SettingRow from "../../../../shared/ui/SettingRow.vue";
import { ref, reactive } from "vue";
import * as useSettingsModule from "../../composables/useSettings";

// Deep import mock per ADR to avoid barrel side effects
vi.mock("../../composables/useSettings", () => ({
  useSettings: vi.fn()
}));

describe("RecoverySettings.vue", () => {
  const mockModules = reactive({
    blitzMode: false
  });
  const mockIsRefreshing = ref(false);
  const mockToggle = vi.fn();
  const mockForceUpdate = vi.fn();
  const mockClearCache = vi.fn();
  const mockFactoryReset = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockModules.blitzMode = false;
    mockIsRefreshing.value = false;

    vi.mocked(useSettingsModule.useSettings).mockReturnValue({
      modules: mockModules,
      toggle: mockToggle,
      isRefreshing: mockIsRefreshing,
      forceUpdate: mockForceUpdate,
      clearCache: mockClearCache,
      factoryReset: mockFactoryReset
    } as any);
  });

  it("renders the EXPERIMENTAL badge", () => {
    const wrapper = mount(RecoverySettings, {
      global: {
        stubs: {
          Icon: true,
          SettingRow: true,
          SettingsCard: {
            template: '<div class="settings-card-stub"><slot name="header-extra" /><slot /></div>'
          }
        },
        directives: {
          tactile: {}
        }
      }
    });

    const badge = wrapper.find(".exp-badge");
    expect(badge.exists()).toBe(true);
    expect(badge.text()).toBe("EXPERIMENTAL");
  });

  it("renders Blitz Mode setting and handles toggle", async () => {
    const wrapper = mount(RecoverySettings, {
      global: {
        stubs: {
          Icon: true,
          SettingsCard: {
            template: '<div class="settings-card-stub"><slot /></div>'
          },
          SettingRow: {
            template: '<div class="setting-row-stub" @click="$emit(\'click\')">{{ label }}</div>',
            props: ['label', 'active', 'loading']
          }
        },
        directives: {
          tactile: {}
        }
      }
    });

    const blitzRow = wrapper.findComponent(SettingRow);
    expect(blitzRow.props('label')).toBe("Blitz Mode");

    await blitzRow.trigger("click");
    expect(mockToggle).toHaveBeenCalledWith("blitzMode");
  });

  it("reflects modules.blitzMode state in SettingRow", () => {
    mockModules.blitzMode = true;
    const wrapper = mount(RecoverySettings, {
      global: {
        stubs: {
          Icon: true,
          SettingsCard: {
            template: '<div class="settings-card-stub"><slot /></div>'
          },
          SettingRow: {
            template: '<div class="setting-row-stub"></div>',
            props: ['label', 'active', 'loading']
          }
        },
        directives: {
          tactile: {}
        }
      }
    });

    const blitzRow = wrapper.findComponent(SettingRow);
    expect(blitzRow.props('active')).toBe(true);
  });

  it("propagates isRefreshing state to SettingRow", () => {
    mockIsRefreshing.value = true;
    const wrapper = mount(RecoverySettings, {
      global: {
        stubs: {
          Icon: true,
          SettingsCard: {
            template: '<div class="settings-card-stub"><slot /></div>'
          },
          SettingRow: {
            template: '<div class="setting-row-stub"></div>',
            props: ['label', 'active', 'loading']
          }
        },
        directives: {
          tactile: {}
        }
      }
    });

    const blitzRow = wrapper.findComponent(SettingRow);
    expect(blitzRow.props('loading')).toBe(true);
  });

  it("calls forceUpdate when Force Update button is clicked", async () => {
    const wrapper = mount(RecoverySettings, {
      global: {
        stubs: {
          Icon: true,
          SettingRow: true,
          SettingsCard: {
            template: '<div class="settings-card-stub"><slot /></div>'
          }
        },
        directives: {
          tactile: {}
        }
      }
    });

    const btn = wrapper.findAll(".trouble-btn").find(b => b.text().includes("Force Update"));
    await btn?.trigger("click");
    expect(mockForceUpdate).toHaveBeenCalled();
  });

  it("calls clearCache when Purge Assets button is clicked", async () => {
    const wrapper = mount(RecoverySettings, {
      global: {
        stubs: {
          Icon: true,
          SettingRow: true,
          SettingsCard: {
            template: '<div class="settings-card-stub"><slot /></div>'
          }
        },
        directives: {
          tactile: {}
        }
      }
    });

    const btn = wrapper.findAll(".trouble-btn").find(b => b.text().includes("Purge Assets"));
    await btn?.trigger("click");
    expect(mockClearCache).toHaveBeenCalled();
  });

  it("calls factoryReset when Factory Reset button is clicked", async () => {
    const wrapper = mount(RecoverySettings, {
      global: {
        stubs: {
          Icon: true,
          SettingRow: true,
          SettingsCard: {
            template: '<div class="settings-card-stub"><slot /></div>'
          }
        },
        directives: {
          tactile: {}
        }
      }
    });

    const btn = wrapper.find(".trouble-btn.danger");
    expect(btn.text()).toContain("Factory Reset");
    await btn.trigger("click");
    expect(mockFactoryReset).toHaveBeenCalled();
  });
});
