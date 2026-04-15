// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import NotificationSettings from "../NotificationSettings.vue";
import { ref, reactive, nextTick } from "vue";
import * as GasClient from "@core/api/GasClient";

// --- MOCKS ---

const mockHaptics = {
  tap: vi.fn(),
  medium: vi.fn(),
  heavy: vi.fn(),
};

const mockBadge = {
  requestPermission: vi.fn().mockResolvedValue("granted"),
  sendLocalNotification: vi.fn(),
};

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
};

const mockAppSettings = {
  modules: reactive({
    experimentalNotifications: false,
    notificationThreshold: 50,
    notificationQuietMode: false,
    notificationSound: true,
  }),
  toggle: vi.fn((key) => {
    (mockAppSettings.modules as any)[key] = !(mockAppSettings.modules as any)[key];
  }),
};

// Deep imports for Layer 1 mocks as per ADR
vi.mock("@core/services/useHaptics", () => ({
  useHaptics: () => mockHaptics,
}));

vi.mock("@core/services/useBadge", () => ({
  useBadge: () => mockBadge,
}));

vi.mock("@core/services/useToast", () => ({
  useToast: () => mockToast,
}));

vi.mock("@core/services/useAppSettings", () => ({
  useAppSettings: () => mockAppSettings,
}));

vi.mock("@core/api/GasClient", () => ({
  isWorkerConfigured: vi.fn().mockReturnValue(true),
  subscribeToPush: vi.fn().mockResolvedValue(true),
}));

// Mock store
const lastSyncTime = ref<number | null>(null);
const startBackgroundSync = vi.fn();

vi.mock("@core/services/useClashDataStore", () => ({
  useClashDataStore: () => ({
    lastSyncTime,
    startBackgroundSync,
  }),
}));

// Shared UI Mocks
vi.mock("@shared", () => ({
  Icon: { template: "<i class='mock-icon'></i>" },
  SettingRow: {
    template: "<div class='setting-row' @click=\"$emit('click')\">{{ label }}</div>",
    props: ["active", "label", "description", "loading", "disabled"],
  },
}));

// Browser API Mocks
const mockServiceWorker = {
  ready: Promise.resolve({
    pushManager: {
      getSubscription: vi.fn().mockResolvedValue(null),
      subscribe: vi.fn().mockResolvedValue({ endpoint: "mock-endpoint" }),
    },
  }),
  controller: {
    postMessage: vi.fn(),
  },
};

describe("NotificationSettings.vue", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();

    // Reset state
    mockAppSettings.modules.experimentalNotifications = false;
    mockAppSettings.modules.notificationThreshold = 50;
    lastSyncTime.value = null;

    // Reset mocks to defaults
    vi.mocked(GasClient.isWorkerConfigured).mockReturnValue(true);
    vi.mocked(GasClient.subscribeToPush).mockResolvedValue(true);

    // Reset Globals
    vi.stubGlobal("Notification", {
      permission: "default",
    });
    vi.stubGlobal("navigator", {
      serviceWorker: mockServiceWorker,
    });
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
    vi.stubGlobal("Notification", { permission: "granted" });
    const now = new Date(2026, 3, 20, 14, 30).getTime(); // 14:30
    lastSyncTime.value = now;

    const wrapper = mount(NotificationSettings, {
      props: { initiallyExpanded: true }
    });
    await nextTick();

    const syncInfo = wrapper.find(".sync-info").text();
    expect(syncInfo).toMatch(/\d{2}:\d{2}/);
    expect(syncInfo).not.toContain("Never");
  });

  it("shows 'Never' for last sync when no sync has occurred", async () => {
    vi.stubGlobal("Notification", { permission: "granted" });
    lastSyncTime.value = null;

    const wrapper = mount(NotificationSettings, {
      props: { initiallyExpanded: true }
    });
    await nextTick();

    expect(wrapper.find(".sync-info").text()).toContain("Never");
  });

  it("updates threshold and triggers haptics and sync", async () => {
    const wrapper = mount(NotificationSettings, {
      props: { initiallyExpanded: true }
    });
    await nextTick();
    const buttons = wrapper.findAll(".threshold-btn");

    // Click '75' button
    await buttons[1].trigger("click");

    expect(mockHaptics.tap).toHaveBeenCalled();
    expect(mockAppSettings.modules.notificationThreshold).toBe(75);
    expect(startBackgroundSync).toHaveBeenCalled();
  });

  it("handles notification permission flow", async () => {
    const wrapper = mount(NotificationSettings, {
      props: { initiallyExpanded: true }
    });
    await nextTick();
    const enableBtn = wrapper.find(".enable-btn");

    await enableBtn.trigger("click");

    expect(mockHaptics.tap).toHaveBeenCalled();
    expect(mockBadge.requestPermission).toHaveBeenCalled();

    vi.stubGlobal("Notification", { permission: "granted" });
    const grantedWrapper = mount(NotificationSettings, {
      props: { initiallyExpanded: true }
    });
    await nextTick();
    expect(grantedWrapper.find(".toggles-grid").exists()).toBe(true);
    expect(grantedWrapper.find(".perm-section").exists()).toBe(false);
  });

  it("handles Cloud Push subscription success", async () => {
    vi.stubGlobal("Notification", { permission: "granted" });
    const wrapper = mount(NotificationSettings, {
      props: { initiallyExpanded: true }
    });
    await nextTick();

    const rows = wrapper.findAll(".setting-row");
    const pushRow = rows.find(r => r.text().includes("Cloud Push"));
    expect(pushRow).toBeDefined();

    await pushRow!.trigger("click");
    await flushPromises();

    expect(mockHaptics.medium).toHaveBeenCalled();
    expect(mockToast.success).toHaveBeenCalledWith("Push Alerts Active");
  });

  it("hides Cloud Push row if worker is not configured", async () => {
    vi.mocked(GasClient.isWorkerConfigured).mockReturnValue(false);

    vi.stubGlobal("Notification", { permission: "granted" });
    const wrapper = mount(NotificationSettings, {
      props: { initiallyExpanded: true }
    });
    await nextTick();

    const rows = wrapper.findAll(".setting-row");
    const pushRow = rows.find(r => r.text().includes("Cloud Push"));
    expect(pushRow).toBeUndefined();
  });

  it("sends test alert via Service Worker when available", async () => {
    vi.stubGlobal("Notification", { permission: "granted" });
    const wrapper = mount(NotificationSettings, {
      props: { initiallyExpanded: true }
    });
    await nextTick();

    const testBtn = wrapper.find(".action-btn");
    await testBtn.trigger("click");

    expect(mockHaptics.heavy).toHaveBeenCalled();
    expect(mockServiceWorker.controller.postMessage).toHaveBeenCalledWith({
      type: "BADGE_NOTIFICATION_ANDROID",
      count: 1,
      threshold: 50,
    });
  });

  it("falls back to local notification for test alert if SW is missing", async () => {
    vi.stubGlobal("navigator", {}); // No SW
    vi.stubGlobal("Notification", { permission: "granted" });

    const wrapper = mount(NotificationSettings, {
      props: { initiallyExpanded: true }
    });
    await nextTick();

    const testBtn = wrapper.find(".action-btn");
    await testBtn.trigger("click");

    expect(mockBadge.sendLocalNotification).toHaveBeenCalledWith(
      "Test Alert",
      expect.stringContaining("Test notification #1")
    );
  });
});
