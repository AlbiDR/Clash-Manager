import { ref, watch, reactive, toRaw } from "vue";
import { idb } from "@core/services/StorageService";

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

// ⚡ PERFORMANCE: Use reactive object for direct property access instead of .value
const modules = reactive<ModuleState>({ ...DEFAULT_STATE });
const isInitialized = ref(false);

/**
 * Robustly merge stored data with default schema to handle upgrades/regressions.
 */
function mergeStorage(stored: any): ModuleState {
  const result = { ...DEFAULT_STATE };
  if (!stored || typeof stored !== "object") return result;

  // Type-safe merging for all keys in ModuleState
  (Object.keys(DEFAULT_STATE) as (keyof ModuleState)[]).forEach((key) => {
    const val = stored[key];
    const expectedType = typeof DEFAULT_STATE[key];

    if (key === "notificationThreshold") {
      if (val === 50 || val === 75) result[key] = val;
    } else if (typeof val === expectedType) {
      (result as any)[key] = val;
    }
  });

  return result;
}

/**
 * COMPOSABLE: useAppSettings
 *
 * @remarks
 * Manages the global application settings and feature flags. This composable
 * acts as a bridge between the reactive UI state and persistent storage layers.
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

    // 🛡️ SYNC: Ensure SW has access to notification settings via IDB
    // We do this once on init and then via the watch
    idb
      .set("cm_notifications_enabled", modules.experimentalNotifications)
      .catch(() => {});
    idb
      .set("cm_notification_threshold", modules.notificationThreshold)
      .catch(() => {});
  }

  // ⚡ PERFORMANCE: Single deep watch for persistence instead of ad-hoc saves
  watch(
    modules,
    (newVal) => {
      try {
        localStorage.setItem(MODULES_KEY, JSON.stringify(toRaw(newVal)));

        // 🛡️ SYNC: Selective sync to IndexedDB for Service Worker
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

  /**
   * Toggle a boolean feature flag safely.
   */
  function toggle(key: keyof ModuleState) {
    const val = modules[key];
    if (typeof val === "boolean") {
      (modules as any)[key] = !val;
    }
  }

  return {
    modules,
    toggle,
    init,
  };
}

export type UseAppSettingsReturn = ReturnType<typeof useAppSettings>;
