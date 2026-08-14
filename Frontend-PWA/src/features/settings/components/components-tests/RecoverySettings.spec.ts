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
  const mockDownloadApk = vi.fn();
  const mockInstallPwa = vi.fn();
  const mockClearCache = vi.fn();
  const mockFactoryReset = vi.fn();
  const mockIsPwaInstallAvailable = ref(false);
  const mockIsPwaStandalone = ref(false);
  const mockIsNativeWrapper = ref(false);

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsRefreshing.value = false;
    mockIsPwaInstallAvailable.value = false;
    mockIsPwaStandalone.value = false;
    mockIsNativeWrapper.value = false;

    vi.mocked(useSettingsModule.useSettings).mockReturnValue({
      isRefreshing: mockIsRefreshing,
      forceUpdate: mockForceUpdate,
      downloadApk: mockDownloadApk,
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
    expect(labels).not.toContain("Install PWA");

    const btn = wrapper.findAll(".trouble-btn").find(b => b.text().includes("Download Update"));
    await btn?.trigger("click");
    expect(mockDownloadApk).toHaveBeenCalled();
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
