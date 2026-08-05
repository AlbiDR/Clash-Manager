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
import { useConfirm } from "@core/services/useConfirm";
import { useConnectionStatus } from "@core/services/useConnectionStatus";
import { useHaptics, useWakeLock } from "@shared";
import { useSystemInfo } from "@core/services/useSystemInfo";
import { useApiState } from "@core/api/useApiState";
import { useBadge } from "@core/services/useBadge";
import { usePwaManager } from "@core/services/usePwaManager";
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
 * - `modules`: Reactive object containing all feature flags and settings.
 * - `theme`: Reactive current theme mode ('light', 'dark', 'auto').
 * - `wakeLock`: Hardware bridge for preventing display sleep.
 * - `isSyntheticMode`: Reactive flag for mock data simulation.
 * - `isBlueprintMode`: Reactive flag for UI skeleton simulation.
 * - `isShowcaseMode`: Reactive flag for branding/marketing mode.
 * - `isHydrated`: Indicates if the clash data store is ready.
 * - `isRefreshing`: Indicates if a data refresh is in progress.
 * - `appVersion`: Authoritative application version string.
 * - `footerBadgeText`: Active status badge for the system footer.
 * - `apiStatusObject`: Computed status configuration for the app header.
 * - `layoutProps`: Reactive configuration for ConsoleLayout standardization.
 * - `layoutEvents`: Action handlers for ConsoleLayout (e.g., refresh).
 * - `apiUrl`: Reactive current Supabase endpoint URL.
 * - `apiStatus`: Connectivity status of the Supabase backend.
 * - `pingData`: Reactive latency metrics for the active API connection.
 * - `notificationPermission`: Status of the browser's Notification API.
 * - `isPushSubscribed`: Indicates if the client has an active push subscription.
 * - `hasWorker`: Indicates if the browser supports the Service Worker API.
 * - `lastSyncFormatted`: Human-readable localized last synchronization time.
 * - `toggle`: Switches boolean feature flags in useAppSettings.
 * - `setTheme`: Authoritative theme setter.
 * - `handleThemeChange`: Brokered theme setter with tactile feedback.
 * - `toggleSyntheticMode`: Toggles mock data simulation.
 * - `toggleBlueprintMode`: Toggles UI skeleton simulation.
 * - `toggleShowcaseMode`: Toggles branding/marketing mode.
 * - `refresh`: Triggers a foreground data refresh from Supabase.
 * - `updateServiceWorker`: Manual Service Worker update controller.
 * - `forceUpdate`: Triggers an immediate Service Worker update check.
 * - `clearCache`: Purges the PWA asset cache and reloads.
 * - `factoryReset`: Destructive wipe of all local application state (IndexedDB, LocalStorage).
 * - `initAppSettings`: Hydration routine for the settings persistence layer.
 * - `haptics`: Access to the brokered haptic feedback engine.
 * - `updateApiUrl`: Logic for changing the remote Supabase endpoint.
 * - `resetApiUrl`: Reverts the API endpoint to the system default.
 * - `requestNotificationPermission`: Brokered permission request with tactile feedback.
 * - `subscribePush`: Logic for establishing a Supabase push subscription.
 * - `sendTestNotification`: Diagnostic tool for verifying badge/push delivery.
 * - `setNotificationThreshold`: Logic for configuring high-potential notification triggers.
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
  // Gates the Cloud Push setting row to browsers that could support it.
  const hasWorker = "serviceWorker" in navigator;
  const {
    notificationPermission,
    isPushSubscribed,
    updateServiceWorker,
    initPwaLifecycle,
    forceUpdate,
    downloadApk,
    clearCache: clearPwaCache,
    factoryReset: performPwaReset
  } = usePwaManager();
  const toast = useToast();
  const { confirm } = useConfirm();
  const { appVersion, activeBadge: footerBadgeText } = useSystemInfo();
  const { apiUrl, apiStatus, pingData } = useApiState();
  const { requestPermission, sendLocalNotification } = useBadge();

  const currentTestCount = ref(1);

  onMounted(() => {
    // [DECISION LOG] Delegating PWA lifecycle orchestration to the Layer 1 manager.
    // This ensures infrastructure boot logic is centralized and decoupled from
    // the feature layer.
    initPwaLifecycle();
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
    // [DECISION LOG] Brokered tactile feedback (haptics) ensures physical touch
    // response for theme changes in the Android WebView shell.
    haptics.tap();
    setTheme(newTheme);
  }

  /**
   * Purges the Service Worker and Cache API assets.
   */
  async function clearCache() {
    // [DECISION LOG] Mandatory clearing of manifest caches via clearManifestCache
    // ensures the next boot is fully clean and synchronized with the network.
    await clearPwaCache(() => clearManifestCache());
  }

  /**
   * Performs a total wipe of local application data.
   */
  async function factoryReset() {
    // [THREAT:] Destructive wipe risk: Unrecoverable data loss for local-only settings.
    // [DECISION LOG] Total wipe strategy is required to guarantee a clean system state
    // when unrecoverable persistence corruption is suspected.
    await performPwaReset(() => clearManifestCache());
  }

  const lastSyncFormatted = computed(() => {
    if (!lastSyncTime?.value) return "Never";
    const syncDate = new Date(lastSyncTime.value);
    return syncDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  });

  function updateApiUrl(targetSupabaseUrl: string) {
    if (targetSupabaseUrl.trim()) {
      localStorage.setItem("cm_supabase_url", targetSupabaseUrl.trim());
      window.location.reload();
    }
  }

  async function resetApiUrl() {
    const isResetConfirmed = await confirm({
      title: "Reset API URL to default?",
      confirmLabel: "Reset",
    });

    if (isResetConfirmed) {
      localStorage.removeItem("cm_supabase_url");
      window.location.reload();
    }
  }

  async function requestNotificationPermission() {
    // [DECISION LOG] Brokered tactile feedback (haptics) ensures physical touch
    // response for permission requests in the Android WebView shell.
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
    // [DECISION LOG] Brokered tactile feedback (haptics) ensures physical touch
    // response for settings changes in the Android WebView shell.
    haptics.tap();
    modules.notificationThreshold = thresholdValue;
    startBackgroundSync();
  }

  function setBlitzSpeed(blitzSpeedSetting: import("@core/config").BlitzSpeed) {
    haptics.tap();
    modules.blitzSpeed = blitzSpeedSetting;
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
    hasWorker,
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
    downloadApk,
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
    setBlitzSpeed,
  };
}
