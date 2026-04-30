// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { mount } from "@vue/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import NetworkSettings from "../NetworkSettings.vue";
import { ref } from "vue";

const mockSettings = {
  apiUrl: ref("https://api.example.com"),
  apiStatus: ref("online"),
  pingData: ref({ latency: 42, version: "1.2.3" }),
  updateApiUrl: vi.fn(),
  resetApiUrl: vi.fn(),
};

vi.mock("../../composables/useSettings", () => ({
  useSettings: () => mockSettings,
}));

describe("NetworkSettings.vue", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSettings.apiUrl.value = "https://api.example.com";
    mockSettings.apiStatus.value = "online";
    mockSettings.pingData.value = { latency: 42, version: "1.2.3" };

    // Mock localStorage
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => (key === "cm_supabase_url" ? null : null)),
    });
  });

  it("renders in checking state with skeleton loaders", async () => {
    mockSettings.apiStatus.value = "checking";
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

  it("handles edit mode and saving new URL via orchestrator", async () => {
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

    expect(mockSettings.updateApiUrl).toHaveBeenCalledWith("https://new-api.com");
  });

  it("handles resetting custom override via orchestrator", async () => {
    vi.stubGlobal("localStorage", {
        getItem: vi.fn((key: string) => (key === "cm_supabase_url" ? "https://custom.com" : null)),
    });

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

    await overridePill.trigger("click");

    expect(mockSettings.resetApiUrl).toHaveBeenCalled();
  });

  it("transitions to editing automatically if unconfigured", async () => {
    mockSettings.apiStatus.value = "unconfigured";
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
