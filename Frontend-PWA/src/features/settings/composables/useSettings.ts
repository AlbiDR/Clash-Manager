// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { useTheme } from "@shared";
import { idb } from "@core/services/StorageService";
import { useAppSettings } from "@core/services/useAppSettings";
import { useBlueprintMode } from "@core/services/useBlueprintMode";
import { useClashDataStore } from "@core";
import { storeToRefs } from "pinia";
import { useShowcaseMode } from "@core/services/useShowcaseMode";
import { useSyntheticMode } from "@core/services/useSyntheticMode";
import { useToast } from "@core/services/useToast";
import { useConnectionStatus } from "@core/services/useConnectionStatus";
import { useHaptics } from "@core/services/useHaptics";
import { useWakeLock } from "@core/services/useWakeLock";
import { useSystemInfo } from "@core/services/useSystemInfo";
import { useApiState } from "@core/api/useApiState";
import { useBadge } from "@core/services/useBadge";
import { subscribeToPush } from "@core/api/SupabaseClient";
import { computed, ref, onMounted } from "vue";
import { useRegisterSW } from "virtual:pwa-register/vue";

/**
 * COMPOSABLE: useSettings
 *
 * @remarks
 * Central orchestrator for the Settings feature. Acts as a Layer 3 Feature Orchestrator
 * (CleanStack Section II) that bridges global infrastructure services (@core) with
 * user-facing configuration views.
 *
 * It brokers access to hardware APIs (Haptics, WakeLock) and PWA lifecycle events
 * (Service Worker updates, Cache purging) through standardized drivers.
 *
 * **Import Boundaries:**
 * - CAN import from `@core`, `@shared`, and internal feature composables.
 * - FORBIDDEN from importing from other features (e.g., `@features/roster`).
 *
 * @returns
 * - `layoutProps`: Reactive configuration for ConsoleLayout standardization.
 * - `layoutEvents`: Action handlers for ConsoleLayout (e.g., refresh).
 * - `forceUpdate`: Triggers a manual Service Worker update check.
 * - `clearCache`: Purges the PWA asset cache and reloads.
 * - `factoryReset`: Destructive wipe of all local application state (IndexedDB, LocalStorage).
 */
export function useSettings() {
  const { modules, toggle, init: initAppSettings } = useAppSettings();
  const { theme, setTheme, clearManifestCache } = useTheme();
  const haptics = useHaptics();
  const wakeLock = useWakeLock();
  const { isSyntheticMode, toggleSyntheticMode } = useSyntheticMode();
  const { isBlueprintMode, toggleBlueprintMode } = useBlueprintMode();
  const { isShowcaseMode, toggleShowcaseMode } = useShowcaseMode();
  const clashDataStore = useClashDataStore();
  const { isHydrated, isRefreshing, lastSyncTime } = storeToRefs(clashDataStore);
  const { refresh, startBackgroundSync } = clashDataStore;
  const { status: unifiedStatus } = useConnectionStatus();
  const { updateServiceWorker } = useRegisterSW();
  const toast = useToast();
  const { appVersion, activeBadge: footerBadgeText } = useSystemInfo();
  const { apiUrl, apiStatus, pingData } = useApiState();
  const { requestPermission, sendLocalNotification } = useBadge();

  const notificationPermission = ref<NotificationPermission | "unsupported">("default");
  const isPushSubscribed = ref(false);
  const currentTestCount = ref(1);

  onMounted(async () => {
    if (typeof Notification !== "undefined") {
      notificationPermission.value = Notification.permission;

      if ("serviceWorker" in navigator) {
        const swRegistration = await navigator.serviceWorker.ready;
        const pushSubscription = await swRegistration.pushManager.getSubscription();
        if (pushSubscription) isPushSubscribed.value = true;
      }
    } else {
      notificationPermission.value = "unsupported";
    }
  });

  const apiStatusObject = computed(() => {
    if (unifiedStatus.value === "online")
      return { type: "success", text: "Systems Online" } as const;
    if (unifiedStatus.value === "offline")
      return { type: "error", text: "Disconnected" } as const;
    if (unifiedStatus.value === "syncing")
      return { type: "loading", text: "Syncing..." } as const;
    if (unifiedStatus.value === "success-resolve")
      return { type: "success", text: "Verified" } as const;

    return { type: "loading", text: "Connecting..." } as const;
  });

  function handleThemeChange(newTheme: "light" | "auto" | "dark") {
    haptics.tap();
    setTheme(newTheme);
  }

  /**
   * Triggers an explicit check for Service Worker updates.
   *
   * @remarks
   * Uses the native `navigator.serviceWorker` API. If a waiting worker is found,
   * it triggers an immediate skipWaiting via `updateServiceWorker(true)`.
   */
  async function forceUpdate() {
    haptics.heavy();
    const activeToastId = toast.info("Checking for updates...");

    // THREAT: Browser environments without Service Worker support (e.g. non-HTTPS, or disabled).
    if (!("serviceWorker" in navigator)) {
      toast.remove(activeToastId);
      toast.error("Service Worker not available");
      return;
    }

    try {
      const swRegistration = await navigator.serviceWorker.getRegistration();
      if (!swRegistration) {
        // Rationale: No registration found usually means the app hasn't fully booted or is in a broken state.
        toast.remove(activeToastId);
        toast.error("No active session found");
        return;
      }

      if (swRegistration.waiting) {
        // Rationale: An update was already downloaded and is ready to be applied.
        toast.remove(activeToastId);
        toast.success("Update ready! Reloading...");
        updateServiceWorker(true);
        return;
      }

      await swRegistration.update();

      if (swRegistration.installing || swRegistration.waiting) {
        toast.remove(activeToastId);
        toast.success("Update found! Downloading...");
      } else {
        toast.remove(activeToastId);
        toast.success("Clash Manager is up to date");
      }
    } catch (swUpdateError) {
      console.error("Update check failed", swUpdateError);
      toast.remove(activeToastId);
      toast.error("Update check failed");
    }
  }

  /**
   * Purges the Service Worker and Cache API assets.
   *
   * @remarks
   * This is a non-destructive recovery action. It unregisters all service workers
   * and deletes all named caches before triggering a hard reload.
   */
  async function clearCache() {
    haptics.medium();
    if (
      confirm(
        "Purge Asset Cache?\n\nThis will clear the Service Worker cache and reload the application. Your settings and data will be preserved.",
      )
    ) {
      // 1. Unregister Workers: Forces the browser to discard the current control logic.
      if ("serviceWorker" in navigator) {
        const swRegistrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of swRegistrations) {
          await registration.unregister();
        }
      }
      // 2. Delete Caches: Clears the 'Stale' or corrupted assets stored via CacheStorage.
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
      clearManifestCache();
      window.location.reload();
    }
  }

  /**
   * Performs a total wipe of local application data.
   *
   * @remarks
   * Destructive action. Clears LocalStorage, SessionStorage, and the authoritative
   * IndexedDB store. Used to resolve deep state corruption.
   */
  async function factoryReset() {
    haptics.heavy();
    if (
      confirm(
        "Reset Application Data?\n\nThis will clear local cache, indexedDB, and settings. Remote database state will NOT be affected.",
      )
    ) {
      localStorage.clear();
      sessionStorage.clear();
      try {
        // Rationale: idb.clear() is the most critical step as it contains the unified sync kernel state.
        await idb.clear();
      } catch (resetError) {
        // Target B [4]: Any plague eliminated.
        console.warn("IDB clear failed", resetError);
      }
      window.location.reload();
    }
  }

  const lastSyncFormatted = computed(() => {
    if (!lastSyncTime?.value) return "Never";
    const syncDate = new Date(lastSyncTime.value);
    return syncDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  });

  function updateApiUrl(newUrl: string) {
    if (newUrl.trim()) {
      localStorage.setItem("cm_supabase_url", newUrl.trim());
      window.location.reload();
    }
  }

  function resetApiUrl() {
    if (confirm("Reset API URL to default?")) {
      localStorage.removeItem("cm_supabase_url");
      window.location.reload();
    }
  }

  async function requestNotificationPermission() {
    haptics.tap();
    const permissionResult = await requestPermission();
    notificationPermission.value = permissionResult;
    return permissionResult;
  }

  async function subscribePush() {
    // Rationale: Native Supabase Push integration pending Edge Function setup.
    toast.info("Push notifications coming soon for Supabase");
  }

  async function sendTestNotification() {
    haptics.heavy();
    const testCount = currentTestCount.value++;

    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "BADGE_NOTIFICATION_ANDROID",
        count: testCount,
        threshold: modules.notificationThreshold,
      });
      console.log(`[Test] Sent badge count: ${testCount}`);
    } else {
      await sendLocalNotification(
        "Test Alert",
        `Test notification #${testCount}. Badge should be ${testCount}.`,
      );
    }
  }

  function setNotificationThreshold(thresholdValue: 50 | 75) {
    haptics.tap();
    modules.notificationThreshold = thresholdValue;
    startBackgroundSync();
  }

  const layoutProps = computed(() => ({
    title: "Settings",
    status: apiStatusObject.value,
    loading: !isHydrated.value,
    isRefreshing: isRefreshing.value,
    sheetUrl: "https://supabase.com/dashboard/project/clash-manager",
    footerBadge: footerBadgeText.value,
  }));

  const layoutEvents = computed(() => ({
    refresh: () => refresh(),
  }));

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
    layoutProps,
    layoutEvents,
    apiUrl,
    apiStatus,
    pingData,
    notificationPermission,
    isPushSubscribed,
    lastSyncFormatted,

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
    updateApiUrl,
    resetApiUrl,
    requestNotificationPermission,
    subscribePush,
    sendTestNotification,
    setNotificationThreshold,
  };
}
