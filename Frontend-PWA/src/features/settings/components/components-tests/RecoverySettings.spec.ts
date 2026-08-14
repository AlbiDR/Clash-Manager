// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { mount } from "@vue/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import RecoverySettings from "../RecoverySettings.vue";
import { ref } from "vue";
import * as useSettingsModule from "../../composables/useSettings";
import * as useNativeBridgeModule from "@core/services/useNativeBridge";
import { computed } from "vue";

// Deep import mock per ADR to avoid barrel side effects
vi.mock("../../composables/useSettings", () => ({
  useSettings: vi.fn()
}));

vi.mock("@core/services/useNativeBridge", () => ({
  useNativeBridge: vi.fn()
}));

describe("RecoverySettings.vue", () => {
  const mockIsRefreshing = ref(false);
  const mockForceUpdate = vi.fn();
  const mockCheckApkUpdate = vi.fn();
  const mockDownloadApk = vi.fn();
  const mockInstallPwa = vi.fn();
  const mockClearCache = vi.fn();
  const mockFactoryReset = vi.fn();
  const mockIsPwaInstallAvailable = ref(false);
  const mockIsPwaStandalone = ref(false);
  const mockIsNativeWrapper = ref(false);
  const mockApkUpdateState = ref("idle");
  const mockApkUpdateMessage = ref("APK status not checked");
  const mockApkUpdateLastCheckedAt = ref<number | undefined>(undefined);
  const mockInstalledApkLabel = ref("v14.45.0 (code 18500)");
  const mockLatestApkLabel = ref("Not checked");
  const mockApkDirectDownloadUrl = ref("");
  const mockApkArtifactLabel = ref("No APK metadata loaded");
  const mockApkFeedSourceLabel = ref("");
  const mockApkChangelog = ref<string[]>([]);

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsRefreshing.value = false;
    mockIsPwaInstallAvailable.value = false;
    mockIsPwaStandalone.value = false;
    mockIsNativeWrapper.value = false;
    mockApkUpdateState.value = "idle";
    mockApkUpdateMessage.value = "APK status not checked";
    mockApkUpdateLastCheckedAt.value = undefined;
    mockInstalledApkLabel.value = "v14.45.0 (code 18500)";
    mockLatestApkLabel.value = "Not checked";
    mockApkDirectDownloadUrl.value = "";
    mockApkArtifactLabel.value = "No APK metadata loaded";
    mockApkFeedSourceLabel.value = "";
    mockApkChangelog.value = [];

    vi.mocked(useSettingsModule.useSettings).mockReturnValue({
      isRefreshing: mockIsRefreshing,
      forceUpdate: mockForceUpdate,
      checkApkUpdate: mockCheckApkUpdate,
      downloadApk: mockDownloadApk,
      apkUpdateState: mockApkUpdateState,
      apkUpdateMessage: mockApkUpdateMessage,
      apkUpdateLastCheckedAt: mockApkUpdateLastCheckedAt,
      installedApkLabel: mockInstalledApkLabel,
      latestApkLabel: mockLatestApkLabel,
      apkDirectDownloadUrl: mockApkDirectDownloadUrl,
      apkArtifactLabel: mockApkArtifactLabel,
      apkFeedSourceLabel: mockApkFeedSourceLabel,
      apkChangelog: mockApkChangelog,
      installPwa: mockInstallPwa,
      isPwaInstallAvailable: mockIsPwaInstallAvailable,
      isPwaStandalone: mockIsPwaStandalone,
      clearCache: mockClearCache,
      factoryReset: mockFactoryReset
    } as any);

    vi.mocked(useNativeBridgeModule.useNativeBridge).mockReturnValue({
      isNativeWrapper: computed(() => mockIsNativeWrapper.value),
    } as any);
  });

  const mountComponent = () => mount(RecoverySettings, {
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

  it("renders the EXPERIMENTAL badge", () => {
    const wrapper = mountComponent();

    const badge = wrapper.find(".exp-badge");
    expect(badge.exists()).toBe(true);
    expect(badge.text()).toBe("EXPERIMENTAL");
  });

  it("calls forceUpdate when Refresh App button is clicked", async () => {
    const wrapper = mountComponent();

    const btn = wrapper.findAll(".trouble-btn").find(b => b.text().includes("Refresh App"));
    await btn?.trigger("click");
    expect(mockForceUpdate).toHaveBeenCalled();
  });

  it("calls clearCache when Purge Assets button is clicked", async () => {
    const wrapper = mountComponent();

    const btn = wrapper.findAll(".trouble-btn").find(b => b.text().includes("Purge Assets"));
    await btn?.trigger("click");
    expect(mockClearCache).toHaveBeenCalled();
  });

  it("calls factoryReset when Factory Reset button is clicked", async () => {
    const wrapper = mountComponent();

    const btn = wrapper.find(".trouble-btn.danger");
    expect(btn.text()).toContain("Factory Reset");
    await btn.trigger("click");
    expect(mockFactoryReset).toHaveBeenCalled();
  });

  it("shows and triggers the APK update action in the native wrapper", async () => {
    mockIsNativeWrapper.value = true;
    mockIsPwaInstallAvailable.value = true;
    const wrapper = mountComponent();

    const labels = wrapper.findAll(".trouble-btn").map(button => button.text());
    expect(labels).toContain("Download Update");
    expect(labels).not.toContain("Check APK");
    expect(labels).not.toContain("Install PWA");

    const btn = wrapper.findAll(".trouble-btn").find(b => b.text().includes("Download Update"));
    await btn?.trigger("click");
    expect(mockDownloadApk).toHaveBeenCalled();
  });

  it("keeps Download Update on the native updater path when an update URL is resolved", async () => {
    mockIsNativeWrapper.value = true;
    mockApkDirectDownloadUrl.value = "https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/clashmanager-v14.45.0%2B191.apk";

    const wrapper = mountComponent();
    const link = wrapper.find("a.trouble-btn");
    const btn = wrapper.findAll("button.trouble-btn").find(b => b.text().includes("Download Update"));

    expect(link.exists()).toBe(false);
    expect(btn?.exists()).toBe(true);

    await btn?.trigger("click");
    expect(mockDownloadApk).toHaveBeenCalled();
  });

  it("shows and triggers native APK diagnostics", async () => {
    mockIsNativeWrapper.value = true;
    mockApkUpdateState.value = "available";
    mockApkUpdateMessage.value = "APK update ready: v14.46.0 (190)";
    mockApkUpdateLastCheckedAt.value = new Date("2026-08-14T03:40:00").getTime();
    mockLatestApkLabel.value = "v14.46.0 (190)";
    mockApkArtifactLabel.value = "4.2 MB · SHA-256 abcdef12...";
    mockApkChangelog.value = ["Native installer polish"];

    const wrapper = mountComponent();

    expect(wrapper.find(".apk-diagnostics").exists()).toBe(true);
    expect(wrapper.text()).toContain("APK update ready");
    expect(wrapper.text()).toContain("v14.45.0 (code 18500)");
    expect(wrapper.text()).toContain("Published");
    expect(wrapper.text()).toContain("v14.46.0 (190)");
    expect(wrapper.text()).toContain("Native installer polish");
    expect(wrapper.find(".apk-feed-source").exists()).toBe(false);
    expect(mockCheckApkUpdate).toHaveBeenCalled();
  });

  it("shows APK feed source only when the published metadata mismatches the installed shell", () => {
    mockIsNativeWrapper.value = true;
    mockApkUpdateState.value = "mismatch";
    mockApkUpdateMessage.value = "Release metadata mismatch";
    mockLatestApkLabel.value = "v14.43.2 (175)";
    mockApkFeedSourceLabel.value = "Remote latest.json: https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/latest.json";

    const wrapper = mountComponent();

    expect(wrapper.find(".apk-feed-source").exists()).toBe(true);
    expect(wrapper.text()).toContain("Remote latest.json");
  });

  it("shows and triggers the PWA install action for web browser sessions", async () => {
    const wrapper = mountComponent();

    const labels = wrapper.findAll(".trouble-btn").map(button => button.text());
    expect(labels).toContain("Install PWA");
    expect(labels).not.toContain("Download Update");

    const btn = wrapper.findAll(".trouble-btn").find(b => b.text().includes("Install PWA"));
    await btn?.trigger("click");
    expect(mockInstallPwa).toHaveBeenCalled();
  });

  it("hides the PWA install action when already running standalone", () => {
    mockIsPwaStandalone.value = true;
    const wrapper = mountComponent();

    const labels = wrapper.findAll(".trouble-btn").map(button => button.text());
    expect(labels).not.toContain("Install PWA");
    expect(labels).not.toContain("Download Update");
  });
});
