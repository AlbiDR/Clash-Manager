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

  it("navigates to overlay settings intent when the overlay row is clicked", async () => {
    const wrapper = mountComponent();
    await wrapper.vm.$nextTick();

    const { openOverlaySettings } = (wrapper.vm as any);
    openOverlaySettings();

    expect(window.location.href).toBe(
      "intent:#Intent;action=android.settings.action.MANAGE_OVERLAY_PERMISSION;package=com.albidr.clashmanager;end"
    );
  });

  it("navigates to overlay intent URL when overlay permission is already allowed", async () => {
    mockBridge.hasOverlayPermission.mockReturnValue(true);
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
    openPackageInstallSettings();

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
