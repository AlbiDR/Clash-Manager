// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WindowWithBridge } from "../../types";

describe("system Battery Saver", () => {
  let saving: boolean;

  beforeEach(() => {
    vi.resetModules();
    saving = false;
    localStorage.clear();
    (window as WindowWithBridge).AndroidBridge = {
      isPowerSaveMode: () => saving,
      setHapticFeedbackEnabled: vi.fn(),
    } as unknown as WindowWithBridge["AndroidBridge"];
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
    })));
  });

  afterEach(() => {
    delete (window as WindowWithBridge).AndroidBridge;
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute("data-power-saving");
  });

  function changePowerSaving(enabled: boolean) {
    saving = enabled;
    window.dispatchEvent(new Event("cm-power-save-change"));
  }

  it("reads the initial system state and ignores event payloads", async () => {
    saving = true;
    const { usePowerSaving } = await import("../usePowerSaving");
    const { isPowerSaving } = usePowerSaving();
    expect(isPowerSaving.value).toBe(true);
    expect(document.documentElement.hasAttribute("data-power-saving")).toBe(true);

    saving = false;
    window.dispatchEvent(new CustomEvent("cm-power-save-change", { detail: true }));
    expect(isPowerSaving.value).toBe(false);
  });

  it("supports browsers and older shells without inventing a saver state", async () => {
    delete (window as WindowWithBridge).AndroidBridge;
    const { usePowerSaving } = await import("../usePowerSaving");
    expect(usePowerSaving().isPowerSaving.value).toBe(false);
    (window as WindowWithBridge).AndroidBridge = {} as WindowWithBridge["AndroidBridge"];
    window.dispatchEvent(new Event("focus"));
    expect(usePowerSaving().isPowerSaving.value).toBe(false);
  });

  it("temporarily overrides light theme and standard motion, then restores the latest preferences", async () => {
    const { useTheme } = await import("@shared/composables/useTheme");
    const { useMotionPreference } = await import("@shared/composables/useMotionPreference");
    const theme = useTheme();
    const motion = useMotionPreference();
    theme.init();
    motion.init();
    theme.setTheme("light");
    motion.setMotionPreference("standard");

    changePowerSaving(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset.motionPreference).toBe("reduced");
    expect(localStorage.getItem("cm_theme_preference")).toBe("light");
    expect(localStorage.getItem("cm_motion_preference")).toBe("standard");

    motion.setMotionPreference("system");
    expect(document.documentElement.dataset.motionPreference).toBe("reduced");
    changePowerSaving(false);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.dataset.motionPreference).toBe("system");
  });

  it("suppresses all vibration in Battery Saver and retains an explicit off choice afterward", async () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    const { useHaptics } = await import("@shared/composables/useHaptics");
    const { useAppSettings } = await import("../useAppSettings");
    const haptics = useHaptics();
    const { modules } = useAppSettings();
    window.dispatchEvent(new Event("click"));
    changePowerSaving(true);
    haptics.tap();
    haptics.custom([60, 40, 60]);
    expect(vibrate).not.toHaveBeenCalled();
    expect(window.AndroidBridge?.setHapticFeedbackEnabled).toHaveBeenLastCalledWith(false);
    expect(modules.hapticFeedback).toBe(true);

    changePowerSaving(false);
    haptics.tap();
    expect(vibrate).toHaveBeenCalledWith(12);
    modules.hapticFeedback = false;
    vibrate.mockClear();
    changePowerSaving(true);
    changePowerSaving(false);
    haptics.tap();
    expect(vibrate).not.toHaveBeenCalled();
    expect(window.AndroidBridge?.setHapticFeedbackEnabled).toHaveBeenLastCalledWith(false);
  });

  it("releases a screen wake lock and restores it only if the user had requested it", async () => {
    const sentinel = new EventTarget();
    const release = vi.fn(async () => sentinel.dispatchEvent(new Event("release")));
    Object.assign(sentinel, { release });
    const request = vi.fn(async () => sentinel);
    vi.stubGlobal("navigator", { wakeLock: { request } });
    const { useWakeLock } = await import("@shared/composables/useWakeLock");
    const lock = useWakeLock();
    await lock.request();
    changePowerSaving(true);
    await vi.waitFor(() => expect(lock.isActive.value).toBe(false));
    expect(release).toHaveBeenCalledOnce();
    await lock.request();
    expect(request).toHaveBeenCalledOnce();

    changePowerSaving(false);
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    await lock.release();
    changePowerSaving(true);
    changePowerSaving(false);
    expect(request).toHaveBeenCalledTimes(2);
  });
});
