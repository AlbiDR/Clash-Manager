// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref, computed, type ComputedRef, type Ref } from "vue";
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
 * Satisfies CleanStack Architecture ADR Section I: Core Services and ADR Section IV:
 * Resilience & Operational Security by brokering all hardware-level interactions
 * and enforcing strict type boundaries.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 (@core)
 * - **Import Boundaries:** May import from Layer 1 (@core) and Layer 0 (@substrate).
 *   Imports from Shared (@shared), Features (@features), or App (@app) are forbidden.
 */

/**
 * Return contract interface for the {@link useNativeBridge} composable.
 *
 * @remarks
 * Satisfies ADR Section I: Core Services and ADR Section IV: Resilience & Operational Security.
 * Defines reactive flags, coordinates, and dispatch methods for native Android hardware brokering.
 */
export interface UseNativeBridgeReturn {
  /** Computed boolean indicating whether running within the native Android TWA shell wrapper. */
  isNativeWrapper: ComputedRef<boolean>;
  /** Safe access to the injected AndroidBridge instance or undefined when running in standard browser. */
  bridge: ComputedRef<AndroidBridge | undefined>;
  /** Reactive status of Android Accessibility permission. */
  isAccessibilityAllowed: Ref<boolean>;
  /** Reactive status of Android Overlay ('Draw over other apps') permission. */
  isOverlayAllowed: Ref<boolean>;
  /** Reactive status of Android REQUEST_INSTALL_PACKAGES permission. */
  isPackageInstallAllowed: Ref<boolean>;
  /** Computed boolean indicating whether native shell supports opening package install settings. */
  isPackageInstallSettingsSupported: ComputedRef<boolean>;
  /** Percentage (0-100) horizontal coordinate for the Blitz invite button tap target. */
  inviteX: Ref<number>;
  /** Percentage (0-100) vertical coordinate for the Blitz invite button tap target. */
  inviteY: Ref<number>;
  /** Percentage (0-100) horizontal coordinate for the Blitz dialog close button tap target. */
  closeX: Ref<number>;
  /** Percentage (0-100) vertical coordinate for the Blitz dialog close button tap target. */
  closeY: Ref<number>;
  /** Re-evaluates native permission flags by querying AndroidBridge methods. */
  checkPermissions: () => void;
  /** Dispatches intent to open Android Accessibility settings. */
  openAccessibilitySettings: () => void;
  /** Dispatches intent to open Android Overlay permission settings for Clash Manager. */
  openOverlaySettings: () => void;
  /** Dispatches intent to open Android package installation permission settings. */
  openPackageInstallSettings: () => boolean;
  /** Hydrates calibration coordinates from native bridge storage. */
  loadCoordinates: () => void;
  /** Serializes and saves calibration coordinates to native bridge storage. */
  saveCoordinates: () => void;
}

// EPHEMERAL: intentionally resets on cold start
// [THREAT ANNOTATION] System permission flags are polled at runtime and reset on cold start.
const isAccessibilityAllowed = ref(false);
const isOverlayAllowed = ref(false);
const isPackageInstallAllowed = ref(false);

// EPHEMERAL: intentionally resets on cold start
// [THREAT ANNOTATION] Stale Calibration Vector: Calibration coordinates reset to native
// defaults on cold start until hydrated from AndroidBridge.getCoordinates().
// They mirror the shell's Calibration.DEFAULT (APK/src/.../Calibration.java) as percentages.
const inviteX = ref(50.83);
const inviteY = ref(72.18);
const closeX = ref(92.13);
const closeY = ref(20.4);

let isInitialized = false;

/**
 * Polls permission flags from the native bridge.
 *
 * @remarks
 * [THREAT ANNOTATION] Main Thread Overhead: Polling hardware state on the main thread;
 * impact is minimized by checking function existence before execution.
 *
 * [DECISION LOG] Permissions are re-checked on 'focus' and 'visibilitychange' to catch
 * system-level changes made while the app was in the background.
 *
 * @sideeffects
 * Mutates module-scoped reactive flags: `isAccessibilityAllowed`, `isOverlayAllowed`, `isPackageInstallAllowed`.
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
 * [THREAT ANNOTATION] Untrusted Producer Boundary: The native layer is an untrusted producer;
 * a missing, non-numeric, or out-of-range axis must never poison reactive state with NaN.
 *
 * @param rawAxisValue - The unvalidated axis value taken from the native payload.
 * @param fallbackPercent - The current percentage to retain when validation fails.
 * @returns The axis as a rounded percentage (0.00-100.00), or the fallback when unusable.
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
 * [THREAT ANNOTATION] Malformed Payload Ingestion: JSON parsing of untrusted native strings
 * is guarded by try-catch and manual per-axis validation to prevent NaN contamination.
 *
 * [DECISION LOG] COORDINATE RECONSTRUCTION: Coordinates are converted from
 * decimal (0.0-1.0) back to percentage (0-100) for UI-layer compatibility.
 *
 * @sideeffects
 * Mutates reactive coordinates `inviteX`, `inviteY`, `closeX`, `closeY`.
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
 *
 * [THREAT ANNOTATION] Corrupted Write Guard: Validates that each coordinate is not NaN
 * before dispatching `saveCoordinates` across the JSBridge interface.
 *
 * @sideeffects
 * Invokes native method `AndroidBridge.saveCoordinates()`.
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
 * [THREAT ANNOTATION] Schema Drift & Untrusted Serialization: The native layer is an
 * untrusted producer, and an older or newer shell may send a shape this build does not know;
 * anything malformed is treated as "no record" rather than reported.
 *
 * Satisfies CleanStack Architecture ADR Section III: Validation Boundaries.
 *
 * @param raw - The unvalidated value returned by `getLastBlitzRun()`.
 * @returns The validated BlitzRunRecord, or null when absent or malformed.
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
 * @remarks
 * Formats a user-facing toast descriptor based on the execution outcome of an automated Blitz session.
 * Distinguishes full invite runs from profile-only scanning runs.
 *
 * @param run - A parsed {@link BlitzRunRecord}.
 * @returns The toast descriptor to show, or null while the run is still in-flight.
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
 *
 * @sideeffects
 * Reads/writes localStorage key `cm.blitz.lastReportedRunEnd` and dispatches toast notifications.
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
 * [DECISION LOG] Re-hydrates permissions, calibration, and completed Blitz execution state.
 * [FIX] Calibration used to load once, so a marker moved in the overlay was
 * overwritten by the PWA's stale copy on its next save.
 *
 * @sideeffects
 * Triggers permission checks, coordinate reloads, and blitz toast evaluations.
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
 * Satisfies CleanStack Architecture ADR Section I: Core Services, ADR Section II:
 * Presentation Orchestration, and ADR Section IV: Resilience & Operational Security.
 * Acts as the authoritative Layer 1 broker between the Vue presentation tier and the
 * native Kotlin AndroidBridge container.
 *
 * @returns {@link UseNativeBridgeReturn} interface containing reactive hardware state and actions.
 *
 * @sideeffects
 * Initializes window and document event listeners for focus and visibility change.
 */
export function useNativeBridge(): UseNativeBridgeReturn {
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
   *
   * @remarks
   * Uses native bridge method when available, with a browser fallback intent URI.
   *
   * @sideeffects
   * Dispatches Android intent via native bridge or redirects window location.
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
   *
   * @remarks
   * Evaluates native bridge capability before dispatching the system intent.
   *
   * @returns Boolean indicating whether the intent was successfully dispatched to AndroidBridge.
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
 *
 * @remarks
 * [DECISION LOG] Test Isolation Guard: Restores initial permissions and coordinate
 * state between test suite runs to avoid leaked side effects.
 *
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
