// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useNativeBridge, resetNativeBridgeState } from "../useNativeBridge";

describe("useNativeBridge", () => {
  const mockBridge = {
    isAccessibilityActive: vi.fn(() => true),
    hasOverlayPermission: vi.fn(() => false),
    canRequestPackageInstalls: vi.fn(() => true),
    getCoordinates: vi.fn(() => JSON.stringify({ inviteX: 0.5, inviteY: 0.6, closeX: 0.7, closeY: 0.8 })),
    saveCoordinates: vi.fn(),
    openAccessibilitySettings: vi.fn(),
    openPackageInstallSettings: vi.fn(),
  };

  beforeEach(() => {
    resetNativeBridgeState();
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      location: { href: "" },
      AndroidBridge: mockBridge,
    });
    vi.stubGlobal("navigator", { userAgent: "android" });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detects native wrapper when AndroidBridge is present", () => {
    const { isNativeWrapper } = useNativeBridge();
    expect(isNativeWrapper.value).toBe(true);
  });

  it("detects non-native environment when AndroidBridge is missing", () => {
    delete (window as any).AndroidBridge;
    const { isNativeWrapper } = useNativeBridge();
    expect(isNativeWrapper.value).toBe(false);
  });

  it("returns no bridge when evaluated without a window global", () => {
    vi.unstubAllGlobals();
    resetNativeBridgeState();

    const { bridge, isNativeWrapper } = useNativeBridge();
    expect(isNativeWrapper.value).toBe(false);
    expect(bridge.value).toBeUndefined();
  });

  it("polls permissions from the bridge", () => {
    const {
      checkPermissions,
      isAccessibilityAllowed,
      isOverlayAllowed,
      isPackageInstallAllowed,
      isPackageInstallSettingsSupported,
    } = useNativeBridge();
    checkPermissions();
    expect(mockBridge.isAccessibilityActive).toHaveBeenCalled();
    expect(mockBridge.hasOverlayPermission).toHaveBeenCalled();
    expect(mockBridge.canRequestPackageInstalls).toHaveBeenCalled();
    expect(isAccessibilityAllowed.value).toBe(true);
    expect(isOverlayAllowed.value).toBe(false);
    expect(isPackageInstallAllowed.value).toBe(true);
    expect(isPackageInstallSettingsSupported.value).toBe(true);
  });

  it("loads and parses coordinates", () => {
    const { loadCoordinates, inviteX, inviteY, closeX, closeY } = useNativeBridge();
    loadCoordinates();
    expect(mockBridge.getCoordinates).toHaveBeenCalled();
    expect(inviteX.value).toBe(50);
    expect(inviteY.value).toBe(60);
    expect(closeX.value).toBe(70);
    expect(closeY.value).toBe(80);
  });

  it("keeps the last known good coordinates when the native payload is partial", () => {
    // Regression: a payload missing keys parses cleanly, so the try-catch never
    // fires; the old multiplication produced NaN and destroyed the defaults.
    const { loadCoordinates, inviteX, inviteY, closeX, closeY } = useNativeBridge();
    mockBridge.getCoordinates.mockReturnValueOnce(JSON.stringify({ inviteX: 0.25 }));
    inviteX.value = 11;
    inviteY.value = 22;
    closeX.value = 33;
    closeY.value = 44;
    loadCoordinates();

    expect(inviteX.value).toBe(25);
    expect(inviteY.value).toBe(22);
    expect(closeX.value).toBe(33);
    expect(closeY.value).toBe(44);
  });

  it("rejects non-numeric and out-of-range axes from the native layer", () => {
    const { loadCoordinates, inviteX, inviteY, closeX, closeY } = useNativeBridge();
    mockBridge.getCoordinates.mockReturnValueOnce(
      JSON.stringify({ inviteX: "0.5", inviteY: null, closeX: 1.5, closeY: -0.2 }),
    );
    inviteX.value = 11;
    inviteY.value = 22;
    closeX.value = 33;
    closeY.value = 44;
    loadCoordinates();

    expect(inviteX.value).toBe(11);
    expect(inviteY.value).toBe(22);
    expect(closeX.value).toBe(33);
    expect(closeY.value).toBe(44);
  });

  it("saves coordinates to the bridge", () => {
    const { saveCoordinates, inviteX, inviteY, closeX, closeY } = useNativeBridge();
    inviteX.value = 10;
    inviteY.value = 20;
    closeX.value = 30;
    closeY.value = 40;
    saveCoordinates();
    expect(mockBridge.saveCoordinates).toHaveBeenCalledWith(0.1, 0.2, 0.3, 0.4);
  });

  it("delegates accessibility settings to the bridge", () => {
    const { openAccessibilitySettings } = useNativeBridge();
    openAccessibilitySettings();
    expect(mockBridge.openAccessibilitySettings).toHaveBeenCalled();
  });

  it("falls back to intent URI for accessibility settings if bridge method is missing", () => {
    const bridgeWithoutMethod = { ...mockBridge };
    delete (bridgeWithoutMethod as any).openAccessibilitySettings;
    (window as any).AndroidBridge = bridgeWithoutMethod;

    const { openAccessibilitySettings } = useNativeBridge();
    openAccessibilitySettings();
    expect(window.location.href).toContain("intent:#Intent;action=android.settings.ACCESSIBILITY_SETTINGS");
  });

  it("delegates package install settings to the bridge", () => {
    const { openPackageInstallSettings } = useNativeBridge();
    expect(openPackageInstallSettings()).toBe(true);
    expect(mockBridge.openPackageInstallSettings).toHaveBeenCalled();
  });

  it("does not emit a broken intent URI if package install settings are unsupported", () => {
    const bridgeWithoutMethod = { ...mockBridge };
    delete (bridgeWithoutMethod as any).openPackageInstallSettings;
    (window as any).AndroidBridge = bridgeWithoutMethod;

    const { openPackageInstallSettings, isPackageInstallSettingsSupported } = useNativeBridge();
    expect(isPackageInstallSettingsSupported.value).toBe(false);
    expect(openPackageInstallSettings()).toBe(false);
    expect(window.location.href).toBe("");
  });
});
