// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { useHaptics, resetHapticsState } from "../useHaptics";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { nextTick } from "vue";
import { useAppSettings } from "@core/services/useAppSettings";

describe("useHaptics", () => {
  const mockVibrate = vi.fn();
  let batteryMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    resetHapticsState();
    useAppSettings().modules.hapticFeedback = true;

    batteryMock = {
      level: 1,
      charging: true,
      saveData: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    vi.stubGlobal("navigator", {
      vibrate: mockVibrate,
      getBattery: vi.fn().mockResolvedValue(batteryMock),
    });

    // Reset interaction state by reloading the module or just accepting it's fresh if not singleton
    // useHaptics returns a NEW object each time, but hasInteracted is defined at module level!
    // Wait, let's check useHaptics.ts again.
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("honors preference changes for existing haptics callers and all patterns", () => {
    const haptics = useHaptics();
    window.dispatchEvent(new Event("click"));
    const { modules } = useAppSettings();
    modules.hapticFeedback = false;

    haptics.tap();
    haptics.success();
    haptics.custom([60, 40, 60]);
    expect(mockVibrate).not.toHaveBeenCalled();

    modules.hapticFeedback = true;
    haptics.tap();
    expect(mockVibrate).toHaveBeenCalledWith(12);
  });

  it("keeps feedback usable when battery status cannot be read", async () => {
    vi.stubGlobal("navigator", {
      vibrate: mockVibrate,
      getBattery: vi.fn().mockRejectedValue(new Error("Unavailable")),
    });
    const haptics = useHaptics();
    await new Promise(resolve => setTimeout(resolve, 0));
    window.dispatchEvent(new Event("click"));
    haptics.tap();
    expect(mockVibrate).toHaveBeenCalledWith(12);
  });

  it("updates reduced feedback when the battery starts charging", async () => {
    batteryMock.level = 0.1;
    batteryMock.charging = false;
    const haptics = useHaptics();
    await new Promise(resolve => setTimeout(resolve, 0));
    window.dispatchEvent(new Event("click"));
    haptics.medium();
    expect(mockVibrate).toHaveBeenLastCalledWith(20);

    batteryMock.charging = true;
    const chargingListener = batteryMock.addEventListener.mock.calls.find(
      ([name]: [string]) => name === "chargingchange",
    )[1];
    chargingListener();
    haptics.medium();
    expect(haptics.isLowPowerMode.value).toBe(false);
    expect(mockVibrate).toHaveBeenLastCalledWith(25);
  });

  it("should not vibrate if no interaction has occurred", () => {
    const haptics = useHaptics();
    haptics.tap();
    expect(mockVibrate).not.toHaveBeenCalled();
  });

  it("should vibrate after interaction", () => {
    const haptics = useHaptics();

    // Simulate interaction
    window.dispatchEvent(new Event("click"));

    haptics.tap();
    expect(mockVibrate).toHaveBeenCalledWith(12);
  });

  it("should scale down vibration in low power mode (battery level low)", async () => {
    batteryMock.level = 0.1;
    batteryMock.charging = false;

    const haptics = useHaptics();

    // Wait for getBattery promise and update()
    await new Promise(resolve => setTimeout(resolve, 0));
    await nextTick();

    expect(haptics.isLowPowerMode.value).toBe(true);

    window.dispatchEvent(new Event("click"));
    haptics.medium(); // normal is 25
    expect(mockVibrate).toHaveBeenCalledWith(20); // 25 - 5
  });

  it("should scale down vibration in low power mode (saveData enabled)", async () => {
    batteryMock.saveData = true;

    const haptics = useHaptics();
    await new Promise(resolve => setTimeout(resolve, 0));
    await nextTick();

    expect(haptics.isLowPowerMode.value).toBe(true);

    window.dispatchEvent(new Event("click"));
    haptics.success(); // normal is [10, 30, 10]
    expect(mockVibrate).toHaveBeenCalledWith([5, 25, 5]);
  });

  it("should provide various haptic patterns", () => {
    const haptics = useHaptics();
    window.dispatchEvent(new Event("click"));

    haptics.heavy();
    expect(mockVibrate).toHaveBeenCalledWith(35);

    haptics.error();
    expect(mockVibrate).toHaveBeenCalledWith([60, 40, 60]);

    haptics.rareFind();
    expect(mockVibrate).toHaveBeenCalledWith([15, 30, 80]);
  });
});
