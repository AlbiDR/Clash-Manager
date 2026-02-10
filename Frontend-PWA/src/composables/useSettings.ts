import { computed } from "vue";
import { useAppSettings } from "@core";
import { useTheme } from "@shared";
import { useHaptics } from "@shared";
import { useWakeLock } from "@shared";
import { useSyntheticMode } from "./useSyntheticMode";
import { useBlueprintMode } from "./useBlueprintMode";
import { useShowcaseMode } from "./useShowcaseMode";
import { useClashData } from "@core";
import { useConnectionStatus } from "@shared";
import { idb } from "@core/services/StorageService";
import { useRegisterSW } from "virtual:pwa-register/vue";
import { useToast } from "./useToast";

/**
 * COMPOSABLE: useSettings
 *
 * @remarks
 * Central orchestrator for the Settings view. Extracts system-level actions
 * (PWA updates, cache management) and display logic from the view.
 *
 * @returns
 * - All state and methods from sub-composables.
 * - `apiStatusObject`: Computed mapping of connection status to UI state.
 * - `footerBadgeText`: Computed label for current specialized display mode.
 * - `appVersion`: Static application version from build environment.
 * - `forceUpdate`: Checks for and applies Service Worker updates.
 * - `clearCache`: Purges browser and service worker caches.
 * - `factoryReset`: Wipes all local application data.
 */
export function useSettings() {
  const { modules, toggle, init: initAppSettings } = useAppSettings();
  const { theme, setTheme, clearManifestCache } = useTheme();
  const haptics = useHaptics();
  const wakeLock = useWakeLock();
  const { isSyntheticMode, toggleSyntheticMode } = useSyntheticMode();
  const { isBlueprintMode, toggleBlueprintMode } = useBlueprintMode();
  const { isShowcaseMode, toggleShowcaseMode } = useShowcaseMode();
  const { isHydrated, isRefreshing, refresh } = useClashData();
  const { status: unifiedStatus } = useConnectionStatus();
  const { updateServiceWorker } = useRegisterSW();
  const toast = useToast();

  const appVersion = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

  const footerBadgeText = computed(() => {
    if (isShowcaseMode.value) return "SHOWCASE";
    if (isBlueprintMode.value) return "BLUEPRINT";
    if (isSyntheticMode.value) return "SYNTHETIC";
    return "";
  });

  const apiStatusObject = computed(() => {
    if (unifiedStatus.value === "online")
      return { type: "ready", text: "Systems Online" } as const;
    if (unifiedStatus.value === "offline")
      return { type: "error", text: "Disconnected" } as const;
    if (unifiedStatus.value === "syncing")
      return { type: "loading", text: "Syncing..." } as const;
    if (unifiedStatus.value === "success-resolve")
      return { type: "ready", text: "Verified" } as const;

    return { type: "loading", text: "Connecting..." } as const;
  });

  function handleThemeChange(newTheme: "light" | "auto" | "dark") {
    haptics.tap();
    setTheme(newTheme);
  }

  async function forceUpdate() {
    haptics.heavy();
    const tId = toast.info("Checking for updates...");

    if (!("serviceWorker" in navigator)) {
      toast.remove(tId);
      toast.error("Service Worker not available");
      return;
    }

    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        toast.remove(tId);
        toast.error("No active session found");
        return;
      }

      if (reg.waiting) {
        toast.remove(tId);
        toast.success("Update ready! Reloading...");
        updateServiceWorker(true);
        return;
      }

      await reg.update();

      if (reg.installing || reg.waiting) {
        toast.remove(tId);
        toast.success("Update found! Downloading...");
      } else {
        toast.remove(tId);
        toast.success("Clash Manager is up to date");
      }
    } catch (e) {
      console.error("Update check failed", e);
      toast.remove(tId);
      toast.error("Update check failed");
    }
  }

  async function clearCache() {
    haptics.medium();
    if (
      confirm(
        "Purge Asset Cache?\n\nThis will clear the Service Worker cache and reload the application. Your settings and data will be preserved.",
      )
    ) {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
      clearManifestCache();
      window.location.reload();
    }
  }

  async function factoryReset() {
    haptics.heavy();
    if (
      confirm(
        "Reset Application Data?\n\nThis will clear local cache, indexedDB, and settings. Data on the Google Sheet will NOT be affected.",
      )
    ) {
      localStorage.clear();
      sessionStorage.clear();
      try {
        await idb.clear();
      } catch (e) {
        console.warn("IDB clear failed", e);
      }
      window.location.reload();
    }
  }

  return {
    // State
    modules,
    theme,
    wakeLock,
    isSyntheticMode,
    isBlueprintMode,
    isShowcaseMode,
    isHydrated,
    isRefreshing,
    appVersion,
    footerBadgeText,
    apiStatusObject,

    // Methods
    toggle,
    setTheme,
    handleThemeChange,
    toggleSyntheticMode,
    toggleBlueprintMode,
    toggleShowcaseMode,
    refresh,
    forceUpdate,
    clearCache,
    factoryReset,
    initAppSettings,
    haptics,
  };
}
