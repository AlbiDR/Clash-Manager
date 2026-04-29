// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
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
  setNotificationThreshold: vi.fn((val) => {
    mockModules.notificationThreshold = val;
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
    expect(wrapper.find(".perm-section").exists()).toBe(true);
    expect(wrapper.find(".enable-btn").text()).toContain("Enable Notifications");
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
});
