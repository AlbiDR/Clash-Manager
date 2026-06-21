// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref, readonly } from "vue";

/**
 * MODULE: ADAPTIVE HAPTICS ENGINE (Layer 1 Core Service)
 * ----------------------------------------------------------------------------
 * DESCRIPTION:
 * Orchestrates device vibration feedback through a tiered, battery-aware proxy.
 * This engine acts as the authoritative broker for tactile interaction across
 * the application, ensuring that feedback is both meaningful and efficient.
 *
 * ARCHITECTURE:
 * - Singleton Pattern: Module-level state ensures that battery listeners and
 *   interaction tracking are instantiated exactly once per app lifecycle.
 * - Brokered Access: Business logic never touches `navigator.vibrate` directly.
 * - Adaptive Scaling: Automatically reduces vibration intensity when the
 *   device enters Low Power Mode or has a critical battery level.
 *
 * OPTIMIZATIONS:
 * - Optimization #48: Adjusts feedback intensity based on battery status.
 * - Optimization #49: Specialized patterns for high-value recruits.
 * ----------------------------------------------------------------------------
 */

/**
 * Native API Type: BatteryManager
 * Represents the W3C Battery Status API interface.
 */
interface BatteryManager extends EventTarget {
  /** Indicates if the device is currently plugged in and charging. */
  charging: boolean;
  /** Floating point number between 0 and 1 representing battery level. */
  level: number;
  /** Experimental flag indicating if the system is in Save Data mode. */
  saveData?: boolean;
  /** Attaches listeners for battery state changes. */
  addEventListener(
    type: "chargingchange" | "levelchange",
    listener: EventListenerOrEventListenerObject,
  ): void;
}

// --- MODULE STATE (SINGLETON) ---
// Rationale: Ensures state and listeners are shared across all call sites
// and eliminates redundant event registration.

/** Reactive status indicating if the system should prioritize power conservation. */
const isLowPowerMode = ref(false);
/** Tracks if the user has performed a gesture required to unlock the Vibration API. */
let hasInteracted = false;
/** Guard variable to prevent multiple initializations of the battery engine. */
let isInitialized = false;

/**
 * Extended Navigator Interface for Battery API.
 * Provides type-safe access to the experimental `getBattery` method.
 */
interface NavigatorWithBattery extends Navigator {
  /** Asynchronously retrieves the battery manager instance. */
  getBattery(): Promise<BatteryManager>;
}

/**
 * INITIALIZATION ENGINE
 *
 * @remarks
 * Guards against redundant listener attachment and ensures the battery
 * monitor is only instantiated once. Implements the interaction tracking
 * required by browser security policies to unlock vibration.
 *
 * @internal
 */
function init() {
  if (isInitialized || typeof window === "undefined") return;

  // 1. Battery Awareness: Preserves device juice in low-power conditions.
  // [THREAT:] Unvalidated hardware boundaries and 'any' pathogens.
  // [DECISION LOG] Utilizing strict type narrowing for NavigatorWithBattery to
  // eliminate 'any' casts and ensure hardware access integrity.
  // Satisfies ADR Section IV: Resilience & Operational Security - Hardware Brokering.
  if ("getBattery" in navigator) {
    (navigator as NavigatorWithBattery)
      .getBattery()
      .then((battery) => {
        const update = () => {
          isLowPowerMode.value =
            !!battery.saveData ||
            (battery.level < 0.2 && !battery.charging);
        };
        battery.addEventListener("levelchange", update);
        battery.addEventListener("chargingchange", update);
        update();
      });
  }

  // 2. Interaction Tracking: Browser security requires user gesture before vibration.
  // [THREAT:] Vibration API calls will be ignored by the browser if triggered
  // without a prior user interaction (security requirement).
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
 * Satisfies ADR Section IV: Resilience & Operational Security - Hardware Brokering.
 * All hardware interactions are brokered through this composable to ensure
 * fallback safety and battery awareness.
 *
 * @returns
 * - `isSupported`: Boolean indicating if the Vibration API is available.
 * - `isLowPowerMode`: Readonly reactive status of the device power state.
 * - `tap`: Standard light feedback (12ms).
 * - `medium`: Standard medium feedback (25ms).
 * - `heavy`: Standard heavy feedback (35ms).
 * - `impact`: Style-based feedback (light/medium/heavy).
 * - `longPress`: Extended feedback for long-press actions (65ms).
 * - `success`: Triple-pulse pattern for positive actions.
 * - `error`: Dual-pulse heavy pattern for critical errors.
 * - `warning`: Sharp double-pulse for warnings.
 * - `sync`: Rapid quadruple-pulse for background synchronization events.
 * - `criticalHit`: Intense pattern for high-value recruitment events.
 * - `rareFind`: Rising intensity pattern for legendary/rare discoveries.
 * - `custom`: Direct access for arbitrary vibration patterns.
 *
 * @sideeffects
 * - Accesses the `navigator.vibrate` hardware API.
 * - Attaches global window listeners on first call (initialization).
 */
export function useHaptics() {
  const isSupported =
    typeof navigator !== "undefined" && "vibrate" in navigator;

  // [PERF] LAZY INIT: Call singleton initialization on first use.
  init();

  /**
   * Internal proxy for the vibration API with power-aware scaling.
   *
   * @param pattern - Duration in ms or a pattern array.
   */
  const vibrate = (pattern: number | number[]) => {
    if (!isSupported || !hasInteracted) return;

    // [PERF] POWER CONSERVATION: Scale down intensity in low power mode.
    // [DECISION LOG] Adaptive haptic scaling: reductions are applied to
    // preserve battery life when the system is in low-power state.
    // This reduces the 'juice' consumed by the vibration motor.
    if (isLowPowerMode.value) {
      if (Array.isArray(pattern)) {
        pattern = pattern.map((patternPart) => Math.max(0, patternPart - 5));
      } else {
        pattern = Math.max(0, pattern - 5);
      }
    }

    try {
      navigator.vibrate(pattern);
    } catch (vibrationError: unknown) {
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
 *
 * @remarks
 * Only functional within the Vitest environment.
 * @internal
 */
export function resetHapticsState() {
  if (import.meta.env.TEST) {
    isLowPowerMode.value = false;
    hasInteracted = false;
    isInitialized = false;
  }
}
