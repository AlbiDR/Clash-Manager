// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { mount } from "@vue/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import NetworkSettings from "../NetworkSettings.vue";
import { ref } from "vue";

const { fetchPipelineHealth, fetchResourcePressure } = vi.hoisted(() => ({
  fetchPipelineHealth: vi.fn(),
  fetchResourcePressure: vi.fn(),
}));

vi.mock("@core/api/SupabaseClient", () => ({
  fetchPipelineHealth,
  fetchResourcePressure,
}));

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
    fetchResourcePressure.mockResolvedValue(null);
    fetchPipelineHealth.mockResolvedValue({
      status: "COMPLETED",
      lastSuccessAt: Date.now(),
      lastTriggeredAt: Date.now(),
      lastFailureAt: null,
    });

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

  it("shows a separate ingestion-health result and can refresh it", async () => {
    fetchPipelineHealth.mockResolvedValue({
      status: "FAILED",
      lastSuccessAt: Date.now() - 3_600_000,
      lastTriggeredAt: Date.now(),
      lastFailureAt: Date.now(),
    });
    const wrapper = mount(NetworkSettings, {
      global: {
        stubs: {
          Icon: true,
          SettingsCard: { template: '<div><slot name="header-extra" /><slot /></div>' },
        },
      },
    });

    await Promise.resolve();
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".pipeline-health").text()).toContain("Needs attention");
    expect(wrapper.find(".pipeline-health").text()).toContain("Last successful data update");

    await wrapper.find(".refresh-health-btn").trigger("click");
    expect(fetchPipelineHealth).toHaveBeenCalledTimes(2);
  });

  it("shows a resource-pressure warning and can refresh it independently", async () => {
    fetchResourcePressure.mockResolvedValue({
      message: "Database size 420 MB is at or above the 400 MB warning threshold.",
      createdAt: Date.now(),
    });
    const wrapper = mount(NetworkSettings, {
      global: {
        stubs: {
          Icon: true,
          SettingsCard: { template: '<div><slot name="header-extra" /><slot /></div>' },
        },
      },
    });

    await Promise.resolve();
    await wrapper.vm.$nextTick();

    const sections = wrapper.findAll(".pipeline-health");
    expect(sections).toHaveLength(2);
    expect(sections[1].text()).toContain("Needs attention");
    expect(sections[1].text()).toContain("Database size 420 MB is at or above the 400 MB warning threshold.");

    await sections[1].find(".refresh-health-btn").trigger("click");
    expect(fetchResourcePressure).toHaveBeenCalledTimes(2);
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
