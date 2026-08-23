// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { mount } from "@vue/test-utils";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resetNativeBridgeState } from "@core/services/useNativeBridge";
import AndroidCalibrationSettings from "../AndroidCalibrationSettings.vue";

describe("AndroidCalibrationSettings.vue", () => {
  const mockBridge = {
    isAccessibilityActive: vi.fn(() => false),
    hasOverlayPermission: vi.fn(() => false),
    canRequestPackageInstalls: vi.fn(() => false),
    openAccessibilitySettings: vi.fn(),
    openPackageInstallSettings: vi.fn(),
    openOverlaySettings: vi.fn(),
    getCoordinates: vi.fn(() => '{"inviteX":0.5083,"inviteY":0.7214,"closeX":0.9213,"closeY":0.2044}'),
    saveCoordinates: vi.fn(),
    startBlitz: vi.fn(),
    openExternalUrl: vi.fn(),
    openPlayerProfile: vi.fn(),
  };

  beforeEach(() => {
    resetNativeBridgeState();
    vi.stubGlobal("window", {
      AndroidBridge: mockBridge,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      location: { href: "" },
    });
    vi.clearAllMocks();
    mockBridge.isAccessibilityActive.mockReturnValue(false);
    mockBridge.hasOverlayPermission.mockReturnValue(false);
    mockBridge.canRequestPackageInstalls.mockReturnValue(false);
    mockBridge.getCoordinates.mockReturnValue('{"inviteX":0.5083,"inviteY":0.7214,"closeX":0.9213,"closeY":0.2044}');
  });

  afterEach(() => {
    delete (window as any).AndroidBridge;
    vi.unstubAllGlobals();
  });

  const mountComponent = () => {
    return mount(AndroidCalibrationSettings);
  };

  it("renders the permissions panel when in native wrapper", () => {
    const wrapper = mountComponent();
    expect(wrapper.find(".permissions-section").exists()).toBe(true);
  });

  it("does not render the permissions panel in PWA mode", () => {
    delete (window as any).AndroidBridge;
    const wrapper = mountComponent();
    expect(wrapper.find(".permissions-section").exists()).toBe(false);
  });

  it("shows denied statuses when permissions are missing", async () => {
    mockBridge.isAccessibilityActive.mockReturnValue(false);
    mockBridge.hasOverlayPermission.mockReturnValue(false);
    mockBridge.canRequestPackageInstalls.mockReturnValue(false);
    const wrapper = mountComponent();
    await wrapper.vm.$nextTick();

    const statusLabels = wrapper.findAll(".permission-status");
    expect(statusLabels[0].text()).toBe("Not allowed");
    expect(statusLabels[1].text()).toBe("Not allowed");
    expect(statusLabels[2].text()).toBe("Confirm in Android");
  });

  it("disables APK install settings when the installed shell is too old", async () => {
    delete (mockBridge as any).openPackageInstallSettings;
    const wrapper = mountComponent();
    await wrapper.vm.$nextTick();

    const rows = wrapper.findAll(".permission-row");
    const apkRow = rows[2];
    expect(apkRow.attributes("disabled")).toBeDefined();
    expect(apkRow.text()).toContain("Update shell first");
    (mockBridge as any).openPackageInstallSettings = vi.fn();
  });

  it("shows 'Allowed' for all permissions when granted", async () => {
    mockBridge.isAccessibilityActive.mockReturnValue(true);
    mockBridge.hasOverlayPermission.mockReturnValue(true);
    mockBridge.canRequestPackageInstalls.mockReturnValue(true);
    const wrapper = mountComponent();
    await wrapper.vm.$nextTick();

    const statusLabels = wrapper.findAll(".permission-status");
    expect(statusLabels[0].text()).toBe("Allowed");
    expect(statusLabels[1].text()).toBe("Allowed");
    expect(statusLabels[2].text()).toBe("Allowed");
  });

  it("calls openAccessibilitySettings when the accessibility row is clicked", async () => {
    const wrapper = mountComponent();
    await wrapper.vm.$nextTick();

    const { openAccessibilitySettings } = (wrapper.vm as any);
    openAccessibilitySettings();

    expect(mockBridge.openAccessibilitySettings).toHaveBeenCalledOnce();
  });

  it("calls the native openOverlaySettings bridge method when the overlay row is clicked", async () => {
    // Regression coverage: this previously always fell through to a
    // malformed raw intent-URI fallback, even inside the native wrapper,
    // because it never checked for the bridge method first (unlike its
    // openAccessibilitySettings/openPackageInstallSettings siblings) - see
    // the decision log in useNativeBridge.ts's openOverlaySettings.
    const wrapper = mountComponent();
    await wrapper.vm.$nextTick();

    const { openOverlaySettings } = (wrapper.vm as any);
    openOverlaySettings();

    expect(mockBridge.openOverlaySettings).toHaveBeenCalledOnce();
    expect(window.location.href).toBe("");
  });

  it("falls back to the raw intent URI when running outside the native wrapper", async () => {
    delete (mockBridge as any).openOverlaySettings;
    const wrapper = mountComponent();
    await wrapper.vm.$nextTick();

    const { openOverlaySettings } = (wrapper.vm as any);
    openOverlaySettings();

    expect(window.location.href).toBe(
      "intent:#Intent;action=android.settings.action.MANAGE_OVERLAY_PERMISSION;package=com.albidr.clashmanager;end"
    );
  });

  it("calls openPackageInstallSettings when the APK update row is clicked", async () => {
    const wrapper = mountComponent();
    await wrapper.vm.$nextTick();

    const { openPackageInstallSettings } = (wrapper.vm as any);
    expect(openPackageInstallSettings()).toBe(true);

    expect(mockBridge.openPackageInstallSettings).toHaveBeenCalledOnce();
  });

  it("re-polls permissions on window focus", async () => {
    mockBridge.isAccessibilityActive.mockReturnValue(false);
    mockBridge.hasOverlayPermission.mockReturnValue(false);
    const wrapper = mountComponent();
    await wrapper.vm.$nextTick();

    mockBridge.isAccessibilityActive.mockReturnValue(true);
    mockBridge.hasOverlayPermission.mockReturnValue(true);
    mockBridge.canRequestPackageInstalls.mockReturnValue(true);

    const focusListener = vi.mocked(window.addEventListener).mock.calls.find(call => call[0] === "focus")?.[1] as Function;
    if (focusListener) focusListener();

    await wrapper.vm.$nextTick();

    const statusLabels = wrapper.findAll(".permission-status");
    expect(statusLabels[0].text()).toBe("Allowed");
    expect(statusLabels[1].text()).toBe("Allowed");
    expect(statusLabels[2].text()).toBe("Allowed");
  });
});
