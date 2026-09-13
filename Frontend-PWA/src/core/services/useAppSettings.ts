// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { idb } from "./StorageService";
import * as v from "valibot";
import { ref, watch, reactive, toRaw } from "vue";
import {
  BLITZ_DWELL_DEFAULT,
  BLITZ_DWELL_MAX,
  BLITZ_DWELL_MIN,
  BLITZ_LEGACY_SPEED_DWELL,
  type LegacyBlitzSpeed,
} from "@core/config";

/** Key used for persisting global feature flags and module settings in LocalStorage. */
const MODULES_KEY = "cm_modules_v2";

/**
 * Interface representing the complete application settings and feature flag state.
 *
 * @remarks
 * Satisfies ADR Section I: Core Services & Section III: Validation Boundaries.
 * Defines the strict type contract for user preferences, feature toggles, and notification parameters.
 */
export interface ModuleState {
  /** Enables automated high-speed scanning and recruitment execution modes. */
  blitzMode: boolean;
  /** Milliseconds the sequencer waits for each profile to render before tapping. */
  blitzDwellMs: number;
  /** Toggles background ghost benchmarking and comparative performance metrics. */
  ghostBenchmarking: boolean;
  /** Controls display of algorithmic sorting logic explanation cards in roster views. */
  sortExplanation: boolean;
  /** Enables background API health monitoring and manual refresher controls. */
  backendRefresher: boolean;
  /** Enables experimental background notifications for recruit alerts and voyage milestones. */
  experimentalNotifications: boolean;
  /** Displays high-potential recruit indicator badges in navigation headers. */
  notificationBadgeHighPotential: boolean;
  /** Minimum score threshold percentage required to trigger notification alerts. */
  notificationThreshold: 50 | 75;
  /** Toggles audible alert sound effects for background notifications. */
  notificationSound: boolean;
  /** Suppresses non-essential notification alerts during quiet hours. */
  notificationQuietMode: boolean;
}

/**
 * Default fallback state for application settings and feature flags.
 *
 * @remarks
 * Serves as the authoritative baseline when initializing settings or recovering from schema parsing failures.
 */
const DEFAULT_STATE: ModuleState = {
  blitzMode: true,
  blitzDwellMs: BLITZ_DWELL_DEFAULT,
  ghostBenchmarking: true,
  sortExplanation: true,
  backendRefresher: false,
  experimentalNotifications: false,
  notificationBadgeHighPotential: true,
  notificationThreshold: 75,
  notificationSound: true,
  notificationQuietMode: false,
};

/**
 * [GUARD] VALIDATION BOUNDARY: Module State Schema
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 * Enforces structural integrity for application settings persisted in LocalStorage.
 * Prevents unvalidated, missing, or malformed settings from corrupting application state.
 */
const ModuleStateSchema = v.object({
  blitzMode: v.optional(v.boolean(), DEFAULT_STATE.blitzMode),
  blitzDwellMs: v.optional(v.number(), DEFAULT_STATE.blitzDwellMs),
  ghostBenchmarking: v.optional(v.boolean(), DEFAULT_STATE.ghostBenchmarking),
  sortExplanation: v.optional(v.boolean(), DEFAULT_STATE.sortExplanation),
  backendRefresher: v.optional(v.boolean(), DEFAULT_STATE.backendRefresher),
  experimentalNotifications: v.optional(v.boolean(), DEFAULT_STATE.experimentalNotifications),
  notificationBadgeHighPotential: v.optional(v.boolean(), DEFAULT_STATE.notificationBadgeHighPotential),
  notificationThreshold: v.optional(v.picklist([50, 75]), DEFAULT_STATE.notificationThreshold),
  notificationSound: v.optional(v.boolean(), DEFAULT_STATE.notificationSound),
  notificationQuietMode: v.optional(v.boolean(), DEFAULT_STATE.notificationQuietMode),
});

// [PERF] PERFORMANCE: Use reactive object for direct property access instead of .value
const modules = reactive<ModuleState>({ ...DEFAULT_STATE });
const isInitialized = ref(false);

// [PERF] PERFORMANCE: Singleton persistence watch guard to prevent redundant watchers across composition calls.
let watchInitialized = false;

/**
 * Reshapes a stored payload written by an earlier version into the current contract.
 *
 * @remarks
 * Runs ahead of the validation boundary so that renamed keys and out-of-domain
 * values are repaired rather than rejected. Satisfies ADR Section III.
 *
 * @param stored - The raw unvalidated payload retrieved from storage.
 * @returns The same payload with legacy fields translated and bounds applied.
 */
function migrateStoredModules(stored: unknown): unknown {
  if (typeof stored !== "object" || stored === null) return stored;

  const payload = { ...(stored as Record<string, unknown>) };
  const storedDwell = payload.blitzDwellMs;

  // [DECISION LOG] LEGACY SPEED TIERS:
  // Before the dwell slider, this setting persisted as one of three speed names.
  // Mapping them onto their equivalent dwell time keeps an existing operator's
  // choice intact; without it the schema would find no `blitzDwellMs`, fall back
  // to the default, and silently discard a deliberate setting.
  if (typeof storedDwell !== "number" && typeof payload.blitzSpeed === "string") {
    const legacyDwell = BLITZ_LEGACY_SPEED_DWELL[payload.blitzSpeed as LegacyBlitzSpeed];
    if (legacyDwell !== undefined) payload.blitzDwellMs = legacyDwell;
  }

  // [THREAT:] A hand-edited or downgraded payload can carry a dwell time outside
  // the domain the control exposes, which would drive the handle off its track.
  // [DECISION LOG] Clamped here rather than rejected by the schema: rejection
  // fails the whole object, so one bad field would reset every unrelated setting.
  if (typeof payload.blitzDwellMs === "number" && Number.isFinite(payload.blitzDwellMs)) {
    payload.blitzDwellMs = Math.min(
      BLITZ_DWELL_MAX,
      Math.max(BLITZ_DWELL_MIN, payload.blitzDwellMs),
    );
  }

  return payload;
}

/**
 * Robustly merges external stored data with default schema to handle upgrades, regressions, and schema drift.
 *
 * @remarks
 * Satisfies ADR Section III: Validation & Persistence Boundaries.
 * Enforces Valibot schema validation on arbitrary JSON inputs from LocalStorage or tab sync events.
 *
 * @param stored - The raw unvalidated payload retrieved from storage.
 * @returns The validated and typed ModuleState object, falling back to defaults if parsing fails.
 */
function mergeStorage(stored: unknown): ModuleState {
  // [GUARD] VALIDATION BOUNDARY: Target B [1]
  // [THREAT:] Malformed or malicious settings payload in LocalStorage causing UI state instability or runtime crashes.
  const result = v.safeParse(ModuleStateSchema, migrateStoredModules(stored));

  if (!result.success) {
    // [DECISION LOG] Safe parse failure logs warning and reverts safely to DEFAULT_STATE without crashing UI bootstrap.
    console.warn("[Modules] Storage validation failed, falling back to defaults", result.issues);
    return { ...DEFAULT_STATE };
  }

  return result.output;
}

/**
 * COMPOSABLE: useAppSettings (Layer 1 - @core)
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core Service (@core/services).
 * - **Role:** Global application settings and feature flag manager with redundant persistence.
 * - **Satisfaction:** Satisfies ADR Section I: Core Services & Section III: Persistence Boundaries.
 *
 * Manages global application settings and feature flags, bridging reactive UI state with persistent storage layers.
 * Implements a "Redundant Persistence" strategy: settings are kept synchronized in `LocalStorage` for the main UI thread
 * and selectively mirrored in `IndexedDB` (`idb`) so background Service Workers can inspect notification preferences.
 *
 * [ARCHITECTURE] ADR LAYER: @core
 * - Permitted Imports: Layer 1 services (e.g., StorageService), utility libraries (Valibot), and Vue core.
 * - Forbidden Imports: Any component or service from Layer 2 (Shared) or Layer 3 (Features).
 *
 * @returns Object contract containing reactive `modules` state, feature `toggle` action, and startup `init` routine.
 *
 * @sideeffects
 * - READS from `LocalStorage` on `init()`.
 * - WRITES to `LocalStorage` on every change to the `modules` object (deep watch).
 * - WRITES to `IndexedDB` (`idb`) to synchronize notification settings with the background Service Worker.
 * - LISTENS to global `storage` events to synchronize settings across concurrent open browser tabs.
 */
export function useAppSettings() {
  // [PERF] LAZY INIT: Initialize singleton persistence watch once.
  if (!watchInitialized) {
    watch(
      modules,
      (newVal) => {
        try {
          // [DECISION LOG] Deep reactive watcher serializes modules state to LocalStorage and mirrors notification controls to IndexedDB.
          localStorage.setItem(MODULES_KEY, JSON.stringify(toRaw(newVal)));

          // [SYNC] SYNC: Selective sync to IndexedDB for background Service Worker
          idb
            .set("cm_notifications_enabled", newVal.experimentalNotifications)
            .catch(() => {});
          idb
            .set("cm_notification_threshold", newVal.notificationThreshold)
            .catch(() => {});
        } catch (modulesPersistenceError) {
          // [THREAT:] Storage quota exhaustion or disabled storage access caught gracefully to prevent UI freeze.
          console.error("[Modules] Failed to persist", modulesPersistenceError);
        }
      },
      { deep: true },
    );
    watchInitialized = true;
  }

  /**
   * INITIALIZATION: Hydrate application settings from persistence layers.
   *
   * @remarks
   * Satisfies ADR Section III: Cache Hydration.
   * Performs critical startup tasks:
   * 1. Hydrates reactive `modules` state from `LocalStorage`.
   * 2. Registers a global `storage` event listener to synchronize settings across concurrent browser tabs.
   * 3. Executes initial synchronization of notification preferences to `IndexedDB` for Service Worker access.
   */
  function init() {
    if (isInitialized.value) return;

    // Load local storage
    try {
      const rawSettingsPayload = localStorage.getItem(MODULES_KEY);
      if (rawSettingsPayload) {
        // [DECISION LOG] Parse raw storage snapshot and merge via Valibot validation guard.
        const parsedSettingsSnapshot = JSON.parse(rawSettingsPayload);
        Object.assign(modules, mergeStorage(parsedSettingsSnapshot));
      }
    } catch (settingsHydrationError) {
      console.warn("[Modules] Storage hydration failed", settingsHydrationError);
    }

    // Sync across tabs
    window.addEventListener("storage", (event) => {
      if (event.key === MODULES_KEY && event.newValue) {
        try {
          // [DECISION LOG] External tab storage update re-validates and merges snapshot into reactive singleton.
          Object.assign(modules, mergeStorage(JSON.parse(event.newValue)));
        } catch (modulesSyncError) {
          /* fail silent on sync */
        }
      }
    });

    isInitialized.value = true;

    // [SYNC] SYNC: Ensure SW has access to notification settings via IDB on startup
    idb
      .set("cm_notifications_enabled", modules.experimentalNotifications)
      .catch(() => {});
    idb
      .set("cm_notification_threshold", modules.notificationThreshold)
      .catch(() => {});
  }

  /**
   * Toggles a boolean feature flag safely by property key.
   *
   * @param key - The key of `ModuleState` to invert if it holds a boolean value.
   */
  function toggle(key: keyof ModuleState) {
    const currentSettingValue = modules[key];
    if (typeof currentSettingValue === "boolean") {
      // THREAT: The 'any Plague' (Target B [4]).
      // [DECISION LOG] Avoid explicit casting or 'any' type coercion by using type-safe key assignment.
      Object.assign(modules, { [key]: !currentSettingValue });
    }
  }

  return {
    modules,
    toggle,
    init,
  };
}

/** Return contract type for the `useAppSettings` composable. */
export type UseAppSettingsReturn = ReturnType<typeof useAppSettings>;
