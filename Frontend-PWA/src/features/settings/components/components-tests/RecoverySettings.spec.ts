// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { mount } from "@vue/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import RecoverySettings from "../RecoverySettings.vue";
import { ref } from "vue";
import * as useSettingsModule from "../../composables/useSettings";

// Deep import mock per ADR to avoid barrel side effects
vi.mock("../../composables/useSettings", () => ({
  useSettings: vi.fn()
}));

describe("RecoverySettings.vue", () => {
  const mockIsRefreshing = ref(false);
  const mockForceUpdate = vi.fn();
  const mockClearCache = vi.fn();
  const mockFactoryReset = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsRefreshing.value = false;

    vi.mocked(useSettingsModule.useSettings).mockReturnValue({
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

  it("calls forceUpdate when Force Update button is clicked", async () => {
    const wrapper = mount(RecoverySettings, {
      global: {
        stubs: {
          Icon: true,
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
