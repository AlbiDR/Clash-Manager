// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref, computed } from "vue";
import { type WindowWithBridge, type AndroidBridge, type BlitzRunRecord } from "@core/types";
import { useToast } from "@core/services/useToast";

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
const isPackageInstallAllowed = ref(false);

// Shown only until the shell answers getCoordinates(). They mirror the shell's
// Calibration.DEFAULT (APK/src/.../Calibration.java) as percentages; inviteY and
// closeY had drifted (72.14 and 20.44), placing the markers away from the taps.
const inviteX = ref(50.83);
const inviteY = ref(72.18);
const closeX = ref(92.13);
const closeY = ref(20.4);

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
  if (typeof bridge.canRequestPackageInstalls === "function") {
    isPackageInstallAllowed.value = bridge.canRequestPackageInstalls();
  }
}

/**
 * Converts a native decimal coordinate (0.0-1.0) into a UI percentage (0-100).
 *
 * @remarks
 * [THREAT:] The native layer is an untrusted producer; a missing or non-numeric
 * axis must never be allowed to poison reactive state with NaN.
 *
 * @param rawAxisValue - The unvalidated axis value taken from the native payload.
 * @param fallbackPercent - The current percentage to retain when validation fails.
 * @returns The axis as a rounded percentage, or the fallback when unusable.
 */
function toCalibrationPercent(rawAxisValue: unknown, fallbackPercent: number): number {
  if (typeof rawAxisValue !== "number" || !Number.isFinite(rawAxisValue)) return fallbackPercent;
  // Native persists resolution-independent decimals; anything outside 0.0-1.0 is corrupt.
  if (rawAxisValue < 0 || rawAxisValue > 1) return fallbackPercent;
  return Math.round(rawAxisValue * 10000) / 100;
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
    const coordinateSnapshot = JSON.parse(rawCoordinates);

    /**
     * [FIX] NaN POISONING GUARD: A partial or malformed native payload
     * (missing keys, nulls, or strings) survives JSON.parse untouched, so the
     * surrounding try-catch never fires. Multiplying an absent key yields NaN,
     * which would overwrite the defaults, render "NaN" in the calibration
     * inputs, and then be rejected by saveCoordinates' own isNaN guard --
     * leaving the user unable to recover the values from the UI.
     * We therefore validate each axis independently and keep the last known
     * good value whenever the native layer hands us something unusable.
     */
    inviteX.value = toCalibrationPercent(coordinateSnapshot?.inviteX, inviteX.value);
    inviteY.value = toCalibrationPercent(coordinateSnapshot?.inviteY, inviteY.value);
    closeX.value = toCalibrationPercent(coordinateSnapshot?.closeX, closeX.value);
    closeY.value = toCalibrationPercent(coordinateSnapshot?.closeY, closeY.value);
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

  const parsedInviteX = typeof inviteX.value === "string" ? parseFloat(inviteX.value) : inviteX.value;
  const parsedInviteY = typeof inviteY.value === "string" ? parseFloat(inviteY.value) : inviteY.value;
  const parsedCloseX = typeof closeX.value === "string" ? parseFloat(closeX.value) : closeX.value;
  const parsedCloseY = typeof closeY.value === "string" ? parseFloat(closeY.value) : closeY.value;

  if (!isNaN(parsedInviteX) && !isNaN(parsedInviteY) && !isNaN(parsedCloseX) && !isNaN(parsedCloseY)) {
    bridge.saveCoordinates(parsedInviteX / 100, parsedInviteY / 100, parsedCloseX / 100, parsedCloseY / 100);
  }
}

/** localStorage key holding the end time of the last Blitz run already reported. */
const REPORTED_RUN_KEY = "cm.blitz.lastReportedRunEnd";
let lastReportedRunEnd = 0;

const BLITZ_RUN_OUTCOMES: readonly BlitzRunRecord["outcome"][] = ["running", "completed", "stopped", "failed"];

/**
 * Parses the shell's Blitz run record.
 *
 * @remarks
 * [THREAT:] The native layer is an untrusted producer, and an older or newer
 * shell may send a shape this build does not know; anything malformed is
 * treated as "no record" rather than reported.
 *
 * @param raw - The unvalidated value returned by `getLastBlitzRun()`.
 * @returns The record, or null when there is none or it is malformed.
 */
export function parseBlitzRun(raw: unknown): BlitzRunRecord | null {
  if (typeof raw !== "string" || raw === "") return null;
  try {
    const run = JSON.parse(raw);
    const isCount = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0;
    if (
      !run || !isCount(run.startedAt) || !isCount(run.endedAt) || !isCount(run.players)
      || !isCount(run.opened) || !isCount(run.invites) || !BLITZ_RUN_OUTCOMES.includes(run.outcome)
    ) {
      return null;
    }
    return {
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      players: run.players,
      opened: run.opened,
      invites: run.invites,
      outcome: run.outcome,
      rehearsal: run.rehearsal === true,
      // Absent from shells that predate profiles-only runs, all of which invited.
      inviting: run.inviting !== false,
    };
  } catch {
    return null;
  }
}

/**
 * One plain sentence about a finished Blitz run.
 *
 * @param run - A parsed run record.
 * @returns The toast to show, or null while the run is still going.
 */
export function describeBlitzRun(run: BlitzRunRecord): { type: "success" | "info" | "error"; message: string } | null {
  const players = `${run.players} ${run.players === 1 ? "player" : "players"}`;
  const prefix = run.rehearsal ? "Rehearsal: " : "";
  switch (run.outcome) {
    case "completed":
      // A profiles-only run never taps Invite, so its invite count says nothing.
      if (run.inviting === false) {
        const profiles = `${run.opened} ${run.opened === 1 ? "profile" : "profiles"}`;
        return { type: "success", message: `${prefix}Blitz finished. Opened ${profiles}.` };
      }
      return run.invites >= run.opened
        ? { type: "success", message: `${prefix}Blitz finished. Tapped Invite for ${run.invites} of ${players}.` }
        : { type: "info", message: `${prefix}Blitz finished, but only ${run.invites} of ${players} got an Invite tap. Check the Blitz accessibility setting.` };
    case "stopped":
      return { type: "info", message: `${prefix}Blitz stopped after ${run.opened} of ${players}.` };
    case "failed":
      return { type: "error", message: `${prefix}Blitz stopped: Clash Royale could not be opened.` };
    default:
      return null;
  }
}

/**
 * Reports the last Blitz run once, when the user is back in the app.
 *
 * @remarks
 * [DECISION LOG] A run happens inside Clash Royale, where the PWA cannot watch
 * it, so the shell records it and the PWA reports it on return. The end time of
 * the reported run is kept in localStorage, so a run that ended while the app
 * was closed is still reported once, and never twice.
 */
function reportLastBlitzRun() {
  const bridge = (window as WindowWithBridge).AndroidBridge;
  if (!bridge || typeof bridge.getLastBlitzRun !== "function") return;
  const run = parseBlitzRun(bridge.getLastBlitzRun());
  if (!run || run.endedAt === 0) return;

  let stored = 0;
  try {
    stored = Number(localStorage.getItem(REPORTED_RUN_KEY)) || 0;
  } catch {
    // Storage unavailable: the in-memory mark below still prevents repeats.
  }
  if (run.endedAt <= Math.max(stored, lastReportedRunEnd)) return;
  lastReportedRunEnd = run.endedAt;
  try {
    localStorage.setItem(REPORTED_RUN_KEY, String(run.endedAt));
  } catch {
    // Ignored, see above.
  }

  const summary = describeBlitzRun(run);
  if (summary) useToast()[summary.type](summary.message);
}

/**
 * Everything that may have changed while the user was in another app: Android
 * settings, calibration moved in the native overlay, and a Blitz run.
 *
 * @remarks
 * [FIX] Calibration used to load once, so a marker moved in the overlay was
 * overwritten by the PWA's stale copy on its next save.
 */
function onReturnToApp() {
  checkPermissions();
  loadCoordinates();
  reportLastBlitzRun();
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

  onReturnToApp();

  // Re-poll whenever the user returns from system settings or from the game.
  // A WebView does not always fire 'focus' on resume, so visibility is watched too.
  if (typeof window.addEventListener === "function") {
    window.addEventListener("focus", onReturnToApp);
  }
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") onReturnToApp();
    });
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
 * - `isPackageInstallAllowed`: Reactive boolean reflecting APK install request status.
 * - `isPackageInstallSettingsSupported`: Whether the installed native shell can open APK install settings.
 * - `inviteX`: Reactive percentage (0-100) for the Blitz 'Invite' button X-coordinate.
 * - `inviteY`: Reactive percentage (0-100) for the Blitz 'Invite' button Y-coordinate.
 * - `closeX`: Reactive percentage (0-100) for the Blitz 'Close' button X-coordinate.
 * - `closeY`: Reactive percentage (0-100) for the Blitz 'Close' button Y-coordinate.
 * - `checkPermissions`: Method to manually trigger a re-poll of native permission flags.
 * - `openAccessibilitySettings`: Method to trigger a native intent for Accessibility settings.
 * - `openOverlaySettings`: Method to trigger a native intent for Overlay permission settings.
 * - `openPackageInstallSettings`: Method to trigger a native intent for APK install settings.
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
    if (typeof window === "undefined") return undefined;
    return (window as WindowWithBridge).AndroidBridge;
  });

  const isPackageInstallSettingsSupported = computed(() =>
    typeof bridge.value?.canRequestPackageInstalls === "function" &&
    typeof bridge.value?.openPackageInstallSettings === "function"
  );

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
   *
   * @remarks
   * [DECISION LOG] Unlike its `openAccessibilitySettings`/
   * `openPackageInstallSettings` siblings, this previously never checked
   * `bridge.value` first - it always fired the raw intent-URI fallback below,
   * even inside the native wrapper. That fallback string is also malformed
   * (missing the `//` after `intent:`), which the wrapper's WebViewClient
   * requires to route it through `Intent.parseUri`; it fell through to a
   * literal `ACTION_VIEW` on the string itself, had no handler, and produced
   * a generic "Could not open link" toast on every tap. Bridge-first (with
   * this same fallback string kept, unchanged, only for a plain browser tab
   * outside the native wrapper) matches the working pattern already proven
   * by `startBlitz()`'s own overlay-permission intent construction.
   */
  function openOverlaySettings() {
    if (bridge.value?.openOverlaySettings) {
      bridge.value.openOverlaySettings();
    } else if (typeof window !== "undefined") {
      window.location.href = "intent:#Intent;action=android.settings.action.MANAGE_OVERLAY_PERMISSION;package=com.albidr.clashmanager;end";
    }
  }

  /**
   * Deep-links the user to the per-app package install permission settings.
   */
  function openPackageInstallSettings(): boolean {
    if (bridge.value?.openPackageInstallSettings) {
      bridge.value.openPackageInstallSettings();
      return true;
    }
    return false;
  }

  return {
    isNativeWrapper,
    bridge,
    isAccessibilityAllowed,
    isOverlayAllowed,
    isPackageInstallAllowed,
    isPackageInstallSettingsSupported,
    inviteX,
    inviteY,
    closeX,
    closeY,
    checkPermissions,
    openAccessibilitySettings,
    openOverlaySettings,
    openPackageInstallSettings,
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
    isPackageInstallAllowed.value = false;
    inviteX.value = 50.83;
    inviteY.value = 72.18;
    closeX.value = 92.13;
    closeY.value = 20.4;
    lastReportedRunEnd = 0;
  }
}
