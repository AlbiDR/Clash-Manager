// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { idb } from "./StorageService";
import * as v from "valibot";
import { ref, watch, reactive, toRaw } from "vue";
const MODULES_KEY = "cm_modules_v2";

export interface ModuleState {
  blitzMode: boolean;
  ghostBenchmarking: boolean;
  sortExplanation: boolean;
  backendRefresher: boolean;
  experimentalNotifications: boolean;
  notificationBadgeHighPotential: boolean;
  notificationThreshold: 50 | 75;
  notificationSound: boolean;
  notificationQuietMode: boolean;
}

const isMobile =
  typeof window !== "undefined"
    ? window.matchMedia("(max-width: 768px)").matches
    : false;

const DEFAULT_STATE: ModuleState = {
  blitzMode: false,
  ghostBenchmarking: false,
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
 * Enforces structural integrity for application settings persisted in LocalStorage.
 * Rationale: Prevents unvalidated or malformed settings from corrupting the UI state.
 */
const ModuleStateSchema = v.object({
  blitzMode: v.optional(v.boolean(), DEFAULT_STATE.blitzMode),
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

// [PERF] PERFORMANCE: Singleton persistence watch.
let watchInitialized = false;

/**
 * Robustly merge stored data with default schema to handle upgrades/regressions.
 *
 * @remarks
 * Implements Target B [1] by enforcing a Valibot schema boundary for
 * external data retrieved from LocalStorage.
 */
function mergeStorage(stored: unknown): ModuleState {
  // [GUARD] VALIDATION BOUNDARY: Target B [1]
  // THREAT: Malformed or malicious settings in LocalStorage causing UI instability.
  const result = v.safeParse(ModuleStateSchema, stored);

  if (!result.success) {
    console.warn("[Modules] Storage validation failed, falling back to defaults", result.issues);
    return { ...DEFAULT_STATE };
  }

  return result.output;
}

/**
 * COMPOSABLE: useAppSettings (Layer 1 - @core)
 *
 * @remarks
 * Manages the global application settings and feature flags. This composable
 * acts as a bridge between the reactive UI state and persistent storage layers.
 *
 * [ARCHITECTURE] ADR LAYER: @core
 * - Permitted Imports: Layer 1 services (e.g., StorageService), utility libraries (Valibot), and Vue core.
 * - Forbidden Imports: Any component or service from Layer 2 (Shared) or Layer 3 (Features).
 *
 * It employs a "Redundant Persistence" strategy, ensuring that settings are
 * available both to the main UI thread (via LocalStorage) and the background
 * Service Worker (via IndexedDB).
 *
 * @returns
 * - `modules`: Reactive object containing all feature flags and settings.
 * - `toggle`: Function to switch boolean settings by key.
 * - `init`: Initialization routine that hydrates state from storage.
 *
 * @sideeffects
 * - READS from `LocalStorage` on `init()`.
 * - WRITES to `LocalStorage` on every change to the `modules` object (deep watch).
 * - WRITES to `IndexedDB` (`idb`) to synchronize notification settings with the Service Worker.
 * - LISTENS to the global `storage` event to synchronize settings across multiple open tabs.
 */
export function useAppSettings() {
  // [PERF] LAZY INIT: Initialize singleton persistence watch once.
  if (!watchInitialized) {
    watch(
      modules,
      (newVal) => {
        try {
          localStorage.setItem(MODULES_KEY, JSON.stringify(toRaw(newVal)));

          // [SYNC] SYNC: Selective sync to IndexedDB for Service Worker
          idb
            .set("cm_notifications_enabled", newVal.experimentalNotifications)
            .catch(() => {});
          idb
            .set("cm_notification_threshold", newVal.notificationThreshold)
            .catch(() => {});
        } catch (e) {
          console.error("[Modules] Failed to persist", e);
        }
      },
      { deep: true },
    );
    watchInitialized = true;
  }

  /**
   * INITIALIZATION: Hydrate application settings.
   *
   * @remarks
   * Performs the following critical startup tasks:
   * 1. Hydrates the reactive `modules` state from `LocalStorage`.
   * 2. Registers a global `storage` event listener to ensure settings are synchronized across
   *    multiple open browser tabs.
   * 3. Performs an initial synchronization of notification settings to `IndexedDB` (idb) to
   *    ensure the Service Worker has access to the user's notification preferences.
   */
  function init() {
    if (isInitialized.value) return;

    // Load local storage
    try {
      const raw = localStorage.getItem(MODULES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        Object.assign(modules, mergeStorage(parsed));
      }
    } catch (e) {
      console.warn("[Modules] Storage hydration failed", e);
    }

    // Sync across tabs
    window.addEventListener("storage", (event) => {
      if (event.key === MODULES_KEY && event.newValue) {
        try {
          Object.assign(modules, mergeStorage(JSON.parse(event.newValue)));
        } catch (e) {
          /* fail silent on sync */
        }
      }
    });

    isInitialized.value = true;

    // [SYNC] SYNC: Ensure SW has access to notification settings via IDB
    // We do this once on init and then via the watch
    idb
      .set("cm_notifications_enabled", modules.experimentalNotifications)
      .catch(() => {});
    idb
      .set("cm_notification_threshold", modules.notificationThreshold)
      .catch(() => {});
  }

  /**
   * Toggle a boolean feature flag safely.
   */
  function toggle(key: keyof ModuleState) {
    const val = modules[key];
    if (typeof val === "boolean") {
      // THREAT: The 'any Plague' (Target B [4]).
      // Rationale: Avoid explicit casting by using a type-safe assignment.
      Object.assign(modules, { [key]: !val });
    }
  }

  return {
    modules,
    toggle,
    init,
  };
}

export type UseAppSettingsReturn = ReturnType<typeof useAppSettings>;
