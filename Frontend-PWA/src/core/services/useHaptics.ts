// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref, readonly } from "vue";

/**
 * ⚡ ADAPTIVE HAPTICS ENGINE
 * Optimization #48: Adjusts feedback intensity based on battery status and power mode.
 * Optimization #49: Specialized patterns for high-value recruits.
 */

// Native API Types
interface BatteryManager extends EventTarget {
  charging: boolean;
  level: number;
  saveData?: boolean;
  addEventListener(
    type: "chargingchange" | "levelchange",
    listener: EventListenerOrEventListenerObject,
  ): void;
}

// [PERF] Module-level state (Singleton)
// Ensures state and listeners are shared across all call sites.
const isLowPowerMode = ref(false);
let hasInteracted = false;
let isInitialized = false;

/**
 * INITIALIZATION ENGINE
 * Guards against redundant listener attachment and ensures the battery
 * monitor is only instantiated once.
 */
function init() {
  if (isInitialized || typeof window === "undefined") return;

  // 1. Battery Awareness: Preserves device juice in low-power conditions.
  if ("getBattery" in (navigator as any)) {
    (navigator as Navigator & { getBattery(): Promise<BatteryManager> })
      .getBattery()
      .then((battery) => {
        const update = () => {
          isLowPowerMode.value =
            (battery as any).saveData ||
            (battery.level < 0.2 && !battery.charging);
        };
        battery.addEventListener("levelchange", update);
        battery.addEventListener("chargingchange", update);
        update();
      });
  }

  // 2. Interaction Tracking: Browser security requires user gesture before vibration.
  const setInteracted = () => {
    hasInteracted = true;
    window.removeEventListener("click", setInteracted);
    window.removeEventListener("touchstart", setInteracted);
    window.removeEventListener("keydown", setInteracted);
  };

  window.addEventListener("click", setInteracted, {
    once: true,
    passive: true,
  });
  window.addEventListener("touchstart", setInteracted, {
    once: true,
    passive: true,
  });
  window.addEventListener("keydown", setInteracted, {
    once: true,
    passive: true,
  });

  isInitialized = true;
}

/**
 * COMPOSABLE: useHaptics
 *
 * @remarks
 * Brokered access to the device vibration hardware. Implements a singleton
 * pattern to minimize event listener overhead and ensure consistent state
 * across the application.
 *
 * @returns
 * - isSupported: Hardware capability check.
 * - isLowPowerMode: Reactive status of the device battery/power state.
 * - tap/medium/heavy: Standard feedback patterns.
 * - success/error/warning/sync: Tactical feedback patterns.
 * - criticalHit/rareFind: Domain-specific reward patterns.
 */
export function useHaptics() {
  const isSupported =
    typeof navigator !== "undefined" && "vibrate" in navigator;

  // [PERF] LAZY INIT: Call singleton initialization on first use.
  init();

  const vibrate = (pattern: number | number[]) => {
    if (!isSupported || !hasInteracted) return;

    // [PERF] POWER CONSERVATION: Scale down intensity in low power mode.
    if (isLowPowerMode.value) {
      if (Array.isArray(pattern)) {
        pattern = pattern.map((p) => Math.max(0, p - 5));
      } else {
        pattern = Math.max(0, pattern - 5);
      }
    }

    try {
      navigator.vibrate(pattern);
    } catch (e) {
      /* Silent fail for non-Haptic devices */
    }
  };

  return {
    isSupported,
    isLowPowerMode: readonly(isLowPowerMode),

    tap: () => vibrate(12),
    medium: () => vibrate(25),
    heavy: () => vibrate(35),
    impact: (style: "light" | "medium" | "heavy") => {
      const styles = { light: 12, medium: 25, heavy: 35 };
      vibrate(styles[style] || 25);
    },
    longPress: () => vibrate(65),

    success: () => vibrate([10, 30, 10]),
    error: () => vibrate([60, 40, 60]),
    warning: () => vibrate([35, 40]),
    sync: () => vibrate([10, 15, 10, 15]),

    // Optimization #49: Special Recruit Patterns
    criticalHit: () => vibrate([20, 100, 20, 100]),
    rareFind: () => vibrate([15, 30, 80]),

    custom: (pattern: number | number[]) => vibrate(pattern),
  };
}

/**
 * TEST EXPORT: Resets the singleton state for unit testing.
 * @internal
 */
export function resetHapticsState() {
  if (import.meta.env.TEST) {
    isLowPowerMode.value = false;
    hasInteracted = false;
    isInitialized = false;
  }
}
