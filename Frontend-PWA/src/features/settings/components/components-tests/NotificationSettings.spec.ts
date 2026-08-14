// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import NotificationSettings from "../NotificationSettings.vue";
import { ref, reactive, nextTick } from "vue";

// --- MOCKS ---

const mockModules = reactive({
  experimentalNotifications: false,
  notificationThreshold: 50,
  notificationQuietMode: false,
  notificationSound: true,
});

const mockSettings = {
  modules: mockModules,
  toggle: vi.fn((key) => {
    (mockModules as any)[key] = !(mockModules as any)[key];
  }),
  notificationPermission: ref("default"),
  isPushSubscribed: ref(false),
  hasWorker: ref(true),
  lastSyncFormatted: ref("12:00"),
  requestNotificationPermission: vi.fn().mockResolvedValue("granted"),
  subscribePush: vi.fn().mockResolvedValue(undefined),
  sendTestNotification: vi.fn().mockResolvedValue(undefined),
  setNotificationThreshold: vi.fn((thresholdValue) => {
    mockModules.notificationThreshold = thresholdValue;
  }),
};

vi.mock("../../composables/useSettings", () => ({
  useSettings: () => mockSettings,
}));

// Shared UI Mocks
vi.mock("@shared", () => ({
  Icon: { template: "<i class='mock-icon'></i>" },
  SettingRow: {
    template: "<div class='setting-row' @click=\"$emit('click')\">{{ label }}</div>",
    props: ["active", "label", "description", "loading", "disabled"],
  },
  SettingsCard: {
    template: "<div class='settings-card' :aria-busy=\"loading ? 'true' : 'false'\"><slot /></div>",
    props: ["title", "icon", "initiallyExpanded", "loading", "bodyClass"],
  },
  vTactile: {
    beforeMount() {},
  }
}));

describe("NotificationSettings.vue", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();

    // Reset state
    mockModules.experimentalNotifications = false;
    mockModules.notificationThreshold = 50;
    mockSettings.notificationPermission.value = "default";
    mockSettings.isPushSubscribed.value = false;
    mockSettings.hasWorker.value = true;
    mockSettings.lastSyncFormatted.value = "Never";
  });

  it("renders correctly with default permissions", async () => {
    const wrapper = mount(NotificationSettings, {
      props: { initiallyExpanded: true }
    });
    await nextTick();
    expect(wrapper.find(".permission-card").exists()).toBe(true);
    expect(wrapper.find(".enable-btn").text()).toContain("Enable");
    expect(wrapper.find(".actions-row").exists()).toBe(false);
  });

  it("formats the last sync time correctly when granted", async () => {
    mockSettings.notificationPermission.value = "granted";
    mockSettings.lastSyncFormatted.value = "14:30";

    const wrapper = mount(NotificationSettings, {
      props: { initiallyExpanded: true }
    });
    await nextTick();

    const syncInfo = wrapper.find(".sync-info").text();
    expect(syncInfo).toContain("14:30");
  });

  it("shows 'Never' for last sync when no sync has occurred", async () => {
    mockSettings.notificationPermission.value = "granted";
    mockSettings.lastSyncFormatted.value = "Never";

    const wrapper = mount(NotificationSettings, {
      props: { initiallyExpanded: true }
    });
    await nextTick();

    expect(wrapper.find(".sync-info").text()).toContain("Never");
  });

  it("updates threshold and triggers orchestrator method", async () => {
    const wrapper = mount(NotificationSettings, {
      props: { initiallyExpanded: true }
    });
    await nextTick();
    const buttons = wrapper.findAll(".threshold-btn");

    // Click '75' button
    await buttons[1].trigger("click");

    expect(mockSettings.setNotificationThreshold).toHaveBeenCalledWith(75);
  });

  it("handles notification permission flow via orchestrator", async () => {
    const wrapper = mount(NotificationSettings, {
      props: { initiallyExpanded: true }
    });
    await nextTick();
    const enableBtn = wrapper.find(".enable-btn");

    await enableBtn.trigger("click");

    expect(mockSettings.requestNotificationPermission).toHaveBeenCalled();
  });

  it("handles Cloud Push subscription via orchestrator", async () => {
    mockSettings.notificationPermission.value = "granted";
    const wrapper = mount(NotificationSettings, {
      props: { initiallyExpanded: true }
    });
    await nextTick();

    const rows = wrapper.findAll(".setting-row");
    const pushRow = rows.find(r => r.text().includes("Cloud Push"));
    expect(pushRow).toBeDefined();

    await pushRow!.trigger("click");

    expect(mockSettings.subscribePush).toHaveBeenCalled();
  });

  it("hides Cloud Push row if worker is not configured", async () => {
    mockSettings.hasWorker.value = false;
    mockSettings.notificationPermission.value = "granted";

    const wrapper = mount(NotificationSettings, {
      props: { initiallyExpanded: true }
    });
    await nextTick();

    const rows = wrapper.findAll(".setting-row");
    const pushRow = rows.find(r => r.text().includes("Cloud Push"));
    expect(pushRow).toBeUndefined();
  });

  it("sends test alert via orchestrator", async () => {
    mockSettings.notificationPermission.value = "granted";
    const wrapper = mount(NotificationSettings, {
      props: { initiallyExpanded: true }
    });
    await nextTick();

    const testBtn = wrapper.find(".action-btn");
    await testBtn.trigger("click");

    expect(mockSettings.sendTestNotification).toHaveBeenCalled();
  });

  it("handles background synchronization toggle click", async () => {
    const wrapper = mount(NotificationSettings, {
      props: { initiallyExpanded: true }
    });
    await nextTick();

    const backgroundSyncRow = wrapper.findAll(".setting-row").find(r => r.text().includes("Background Sync"));
    expect(backgroundSyncRow).toBeDefined();

    await backgroundSyncRow!.trigger("click");
    expect(mockSettings.toggle).toHaveBeenCalledWith("experimentalNotifications");
  });

  it("handles Quiet Mode toggle click when permission is granted", async () => {
    mockSettings.notificationPermission.value = "granted";
    const wrapper = mount(NotificationSettings, {
      props: { initiallyExpanded: true }
    });
    await nextTick();

    const quietModeRow = wrapper.findAll(".setting-row").find(r => r.text().includes("Quiet Mode"));
    expect(quietModeRow).toBeDefined();

    await quietModeRow!.trigger("click");
    expect(mockSettings.toggle).toHaveBeenCalledWith("notificationQuietMode");
  });

  it("handles Sound toggle click when permission is granted", async () => {
    mockSettings.notificationPermission.value = "granted";
    const wrapper = mount(NotificationSettings, {
      props: { initiallyExpanded: true }
    });
    await nextTick();

    const soundRow = wrapper.findAll(".setting-row").find(r => r.text().includes("Sound"));
    expect(soundRow).toBeDefined();

    await soundRow!.trigger("click");
    expect(mockSettings.toggle).toHaveBeenCalledWith("notificationSound");
  });

  it("displays the correct badge preview text when threshold is 50", async () => {
    mockModules.notificationThreshold = 50;
    const wrapper = mount(NotificationSettings, {
      props: { initiallyExpanded: true }
    });
    await nextTick();

    const thresholdRow = wrapper.find(".threshold-row");
    expect(thresholdRow.text()).toContain("Good and higher");
  });

  it("displays the correct badge preview text when threshold is 75", async () => {
    mockModules.notificationThreshold = 75;
    const wrapper = mount(NotificationSettings, {
      props: { initiallyExpanded: true }
    });
    await nextTick();

    const thresholdRow = wrapper.find(".threshold-row");
    expect(thresholdRow.text()).toContain("High potential");
  });
});
