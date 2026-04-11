// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { mount } from "@vue/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import NetworkSettings from "../NetworkSettings.vue";
import { ref } from "vue";
import * as useApiStateModule from "../../../../core/api/useApiState";

// Deep import mock per ADR to avoid barrel side effects
vi.mock("../../../../core/api/useApiState", () => ({
  useApiState: vi.fn()
}));

describe("NetworkSettings.vue", () => {
  const mockApiUrl = ref("https://api.example.com");
  const mockApiStatus = ref("online");
  const mockPingData = ref({ latency: 42, version: "1.2.3" });

  beforeEach(() => {
    vi.clearAllMocks();

    mockApiUrl.value = "https://api.example.com";
    mockApiStatus.value = "online";
    mockPingData.value = { latency: 42, version: "1.2.3" };

    vi.mocked(useApiStateModule.useApiState).mockReturnValue({
      apiUrl: mockApiUrl,
      apiStatus: mockApiStatus,
      pingData: mockPingData,
      apiConfigured: ref(true),
      workerStatus: ref("online"),
      checkApiStatus: vi.fn(),
      init: vi.fn()
    } as any);

    // Mock localStorage
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => store[key] || null),
      setItem: vi.fn((key: string, value: string) => { store[key] = value.toString(); }),
      removeItem: vi.fn((key: string) => { delete store[key]; }),
    });

    // Mock window.location.reload
    vi.stubGlobal("location", { reload: vi.fn() });

    // Mock confirm
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  it("renders in checking state with skeleton loaders", async () => {
    mockApiStatus.value = "checking";
    const wrapper = mount(NetworkSettings, {
      props: { initiallyExpanded: true },
      global: {
        stubs: {
          Icon: true,
          SettingsCard: {
            template: '<div class="settings-card-stub"><slot name="header-extra" /><slot /></div>',
            props: ['loading']
          }
        }
      }
    });

    expect(wrapper.find(".sk-stat-value").exists()).toBe(true);
    expect(wrapper.find(".url-readout").classes()).toContain("skeleton-anim");
  });

  it("renders online status and ping data correctly", async () => {
    const wrapper = mount(NetworkSettings, {
      props: { initiallyExpanded: true },
      global: {
        stubs: {
          Icon: true,
          SettingsCard: {
            template: '<div class="settings-card-stub"><slot name="header-extra" /><slot /></div>'
          }
        }
      }
    });

    expect(wrapper.text()).toContain("42ms");
    expect(wrapper.text()).toContain("v1.2.3");
    expect(wrapper.find(".url-text").text()).toBe("https://api.example.com");
  });

  it("handles edit mode and saving new URL", async () => {
    const wrapper = mount(NetworkSettings, {
      props: { initiallyExpanded: true },
      global: {
        stubs: {
          Icon: true,
          SettingsCard: {
            template: '<div class="settings-card-stub"><slot name="header-extra" /><slot /></div>'
          }
        }
      }
    });

    // Click edit
    await wrapper.find(".edit-btn").trigger("click");

    const input = wrapper.find("input");
    expect(input.exists()).toBe(true);

    await input.setValue("https://new-api.com");
    await wrapper.find(".save-btn").trigger("click");

    expect(localStorage.setItem).toHaveBeenCalledWith("cm_gas_url", "https://new-api.com");
    expect(window.location.reload).toHaveBeenCalled();
  });

  it("handles resetting custom override", async () => {
    vi.mocked(localStorage.getItem).mockReturnValue("https://custom.com");

    const wrapper = mount(NetworkSettings, {
      props: { initiallyExpanded: true },
      global: {
        stubs: {
          Icon: true,
          SettingsCard: {
            template: '<div class="settings-card-stub"><slot name="header-extra" /><slot /></div>'
          }
        }
      }
    });

    const overridePill = wrapper.find(".override-pill");
    expect(overridePill.exists()).toBe(true);
    expect(overridePill.text()).toContain("Running custom override");

    await overridePill.trigger("click");

    expect(window.confirm).toHaveBeenCalled();
    expect(localStorage.removeItem).toHaveBeenCalledWith("cm_gas_url");
    expect(window.location.reload).toHaveBeenCalled();
  });

  it("transitions to editing automatically if unconfigured", async () => {
    mockApiStatus.value = "unconfigured";
    const wrapper = mount(NetworkSettings, {
      props: { initiallyExpanded: true },
      global: {
        stubs: {
          Icon: true,
          SettingsCard: {
            template: '<div class="settings-card-stub"><slot name="header-extra" /><slot /></div>'
          }
        }
      }
    });

    // Watcher should have triggered isEditing = true immediately due to { immediate: true }
    expect(wrapper.find("input").exists()).toBe(true);
  });
});
