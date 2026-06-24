// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { useTheme } from "@shared";
import { useAppSettings } from "@core/services/useAppSettings";
import { useBlueprintMode } from "@core/services/useBlueprintMode";
import { useClashDataStore } from "@core";
import { storeToRefs } from "pinia";
import { useShowcaseMode } from "@core/services/useShowcaseMode";
import { useSyntheticMode } from "@core/services/useSyntheticMode";
import { useToast } from "@core/services/useToast";
import { useConnectionStatus } from "@core/services/useConnectionStatus";
import { useHaptics, useWakeLock } from "@shared";
import { useSystemInfo } from "@core/services/useSystemInfo";
import { useApiState } from "@core/api/useApiState";
import { useBadge } from "@core/services/useBadge";
import { usePwaManager } from "@core/services/usePwaManager";
import { subscribeToPush } from "@core/api/MaintenanceClient";
import { computed, ref, onMounted } from "vue";
// import { registerSW } from "virtual:pwa-register";

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
  const { updateServiceWorker, forceUpdate, clearCache: clearPwaCache, factoryReset: performPwaReset } = usePwaManager();
  const toast = useToast();
  const { appVersion, activeBadge: footerBadgeText } = useSystemInfo();
  const { apiUrl, apiStatus, pingData } = useApiState();
  const { requestPermission, sendLocalNotification } = useBadge();

  const notificationPermission = ref<NotificationPermission | "unsupported">("default");
  const isPushSubscribed = ref(false);
  const currentTestCount = ref(1);

  onMounted(() => {
    // CRITICAL: Bypassing PWA logic in development/showcase mode to prevent 
    // headless browser crashes during branding asset generation.
    if (!import.meta.env.PROD) return;

    // Rationale: Delaying execution avoids clashing with initial render/font loading
    // which frequently causes 'Target crashed' errors in headless browser pipelines.
    setTimeout(async () => {
      // Initialize Service Worker
      if ("serviceWorker" in navigator) {
        try {
          const { registerSW } = await import("virtual:pwa-register");
          updateServiceWorker.value = registerSW({
            onNeedRefresh() {
              console.log("[PWA] Update available");
            },
          });
        } catch (e) {
          console.warn("[PWA] SW Registration failed", e);
        }
      }

      if (typeof Notification !== "undefined") {
        notificationPermission.value = Notification.permission;

        if ("serviceWorker" in navigator) {
          const swRegistration = await navigator.serviceWorker.ready;
          const pushSubscription = await swRegistration.pushManager?.getSubscription();
          if (pushSubscription) isPushSubscribed.value = true;
        }
      } else {
        notificationPermission.value = "unsupported";
      }
    }, 1500);
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
   * Purges the Service Worker and Cache API assets.
   */
  async function clearCache() {
    await clearPwaCache(() => clearManifestCache());
  }

  /**
   * Performs a total wipe of local application data.
   */
  async function factoryReset() {
    await performPwaReset(() => clearManifestCache());
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
    updateServiceWorker: (reload?: boolean) => updateServiceWorker.value(reload),
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
