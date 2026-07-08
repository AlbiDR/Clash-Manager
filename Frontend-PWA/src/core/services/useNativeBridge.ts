// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref, computed } from "vue";
import { type WindowWithBridge, type AndroidBridge } from "@core/types";

/**
 * NATIVE BRIDGE SERVICE (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Centralizes the orchestration of the Native Android JSBridge
 * (TWA wrapper) to satisfy hardware brokerage and structural decoupling.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * This service manages the physical/native layer state, including system
 * permissions (Accessibility, Overlay) and Blitz Mode calibration coordinates.
 *
 * It provides a safe, reactive interface to the Kotlin-backed AndroidBridge,
 * ensuring that the web-layer remains decoupled from hardware specifics and
 * provides graceful fallbacks for standard PWA environments.
 *
 * Satisfies ADR Section IV (Resilience & Operational Security) by brokering
 * all hardware-level interactions and enforcing strict type boundaries.
 */

const isAccessibilityAllowed = ref(false);
const isOverlayAllowed = ref(false);

const inviteX = ref(50.83);
const inviteY = ref(72.14);
const closeX = ref(92.13);
const closeY = ref(20.44);

let isInitialized = false;

/**
 * Polls permission flags from the native bridge.
 *
 * @remarks
 * [THREAT:] Polling hardware state on the main thread; impact is minimized
 * by checking function existence before execution.
 *
 * [DECISION LOG] Permissions are re-checked on 'focus' to catch system-level
 * changes made while the app was in the background.
 */
function checkPermissions() {
  if (typeof window === "undefined") return;
  const bridge = (window as WindowWithBridge).AndroidBridge;
  if (!bridge) return;

  if (typeof bridge.isAccessibilityActive === "function") {
    isAccessibilityAllowed.value = bridge.isAccessibilityActive();
  }
  if (typeof bridge.hasOverlayPermission === "function") {
    isOverlayAllowed.value = bridge.hasOverlayPermission();
  }
}

/**
 * Hydrates calibration coordinates from native persistence.
 *
 * @remarks
 * [THREAT:] JSON parsing of untrusted native strings; guarded by try-catch
 * and manual validation of parsed values.
 *
 * [DECISION LOG] COORDINATE RECONSTRUCTION: Coordinates are converted from
 * decimal (0.0-1.0) back to percentage (0-100) for UI-layer compatibility.
 */
function loadCoordinates() {
  if (typeof window === "undefined") return;
  const bridge = (window as WindowWithBridge).AndroidBridge;
  if (!bridge || !bridge.getCoordinates) return;

  try {
    const rawCoordinates = bridge.getCoordinates();
    const coords = JSON.parse(rawCoordinates);
    inviteX.value = Math.round(coords.inviteX * 10000) / 100;
    inviteY.value = Math.round(coords.inviteY * 10000) / 100;
    closeX.value = Math.round(coords.closeX * 10000) / 100;
    closeY.value = Math.round(coords.closeY * 10000) / 100;
  } catch (nativeCoordinatesError: unknown) {
    const errorMessage = nativeCoordinatesError instanceof Error ? nativeCoordinatesError.message : String(nativeCoordinatesError);
    console.error("[useNativeBridge] Failed to parse coordinates:", errorMessage);
  }
}

/**
 * Persists calibration coordinates to the native layer.
 *
 * @remarks
 * [DECISION LOG] COORDINATE NORMALIZATION: Values are stored as floats (0.0-1.0)
 * to remain resolution-independent across different device screen densities.
 */
function saveCoordinates() {
  if (typeof window === "undefined") return;
  const bridge = (window as WindowWithBridge).AndroidBridge;
  if (!bridge || !bridge.saveCoordinates) return;

  const ix = typeof inviteX.value === "string" ? parseFloat(inviteX.value) : inviteX.value;
  const iy = typeof inviteY.value === "string" ? parseFloat(inviteY.value) : inviteY.value;
  const cx = typeof closeX.value === "string" ? parseFloat(closeX.value) : closeX.value;
  const cy = typeof closeY.value === "string" ? parseFloat(closeY.value) : closeY.value;

  if (!isNaN(ix) && !isNaN(iy) && !isNaN(cx) && !isNaN(cy)) {
    bridge.saveCoordinates(ix / 100, iy / 100, cx / 100, cy / 100);
  }
}

/**
 * INITIALIZATION ENGINE
 *
 * @internal
 * @remarks
 * [DECISION LOG] Focus-based re-polling: Attaching to 'focus' ensures that
 * when a user returns from Android System Settings (after granting permissions),
 * the app state reflects these changes immediately.
 */
function init() {
  if (isInitialized || typeof window === "undefined") return;
  isInitialized = true;

  loadCoordinates();
  checkPermissions();

  // Re-poll permissions whenever the user returns from system settings
  if (typeof window.addEventListener === "function") {
    window.addEventListener("focus", checkPermissions);
  }
}

/**
 * COMPOSABLE: useNativeBridge
 *
 * @remarks
 * Satisfies ADR Section II (Structural Unitary Architecture) by providing a
 * singleton interface to hardware capabilities and native Android orchestration.
 *
 * @returns An object containing:
 * - `isNativeWrapper`: Computed boolean indicating if running inside the Android TWA.
 * - `bridge`: Safe access to the `AndroidBridge` instance or undefined if unavailable.
 * - `isAccessibilityAllowed`: Reactive boolean reflecting Accessibility permission status.
 * - `isOverlayAllowed`: Reactive boolean reflecting Overlay (Draw Over Other Apps) permission status.
 * - `inviteX`: Reactive percentage (0-100) for the Blitz 'Invite' button X-coordinate.
 * - `inviteY`: Reactive percentage (0-100) for the Blitz 'Invite' button Y-coordinate.
 * - `closeX`: Reactive percentage (0-100) for the Blitz 'Close' button X-coordinate.
 * - `closeY`: Reactive percentage (0-100) for the Blitz 'Close' button Y-coordinate.
 * - `checkPermissions`: Method to manually trigger a re-poll of native permission flags.
 * - `openAccessibilitySettings`: Method to trigger a native intent for Accessibility settings.
 * - `openOverlaySettings`: Method to trigger a native intent for Overlay permission settings.
 * - `loadCoordinates`: Method to hydrate calibration state from the native bridge.
 * - `saveCoordinates`: Method to persist current calibration state to the native bridge.
 */
export function useNativeBridge() {
  init();

  /**
   * Authoritative detection of the native Android TWA wrapper.
   */
  const isNativeWrapper = computed(() => {
    if (typeof window === "undefined") return false;
    return !!(window as WindowWithBridge).AndroidBridge;
  });

  /**
   * Safe access to the native bridge instance.
   */
  const bridge = computed<AndroidBridge | undefined>(() => {
    return (window as WindowWithBridge).AndroidBridge;
  });

  /**
   * Deep-links the user to the Accessibility settings.
   */
  function openAccessibilitySettings() {
    if (bridge.value?.openAccessibilitySettings) {
      bridge.value.openAccessibilitySettings();
    } else {
      // Fallback intent for standard Android browsers
      if (typeof window !== "undefined") {
        window.location.href = "intent:#Intent;action=android.settings.ACCESSIBILITY_SETTINGS;end";
      }
    }
  }

  /**
   * Deep-links the user to the Overlay permission settings.
   */
  function openOverlaySettings() {
    if (typeof window !== "undefined") {
      window.location.href = "intent:#Intent;action=android.settings.action.MANAGE_OVERLAY_PERMISSION;package=com.albidr.clashmanager;end";
    }
  }

  return {
    isNativeWrapper,
    bridge,
    isAccessibilityAllowed,
    isOverlayAllowed,
    inviteX,
    inviteY,
    closeX,
    closeY,
    checkPermissions,
    openAccessibilitySettings,
    openOverlaySettings,
    loadCoordinates,
    saveCoordinates,
  };
}

/**
 * TEST EXPORT: Resets the singleton state for unit testing.
 * @internal
 */
export function resetNativeBridgeState() {
  if (import.meta.env.TEST) {
    isInitialized = false;
    isAccessibilityAllowed.value = false;
    isOverlayAllowed.value = false;
    inviteX.value = 50.83;
    inviteY.value = 72.14;
    closeX.value = 92.13;
    closeY.value = 20.44;
  }
}
