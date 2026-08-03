// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref } from "vue";
import { useToast } from "./useToast";
import { idb } from "./StorageService";
import { useNativeBridge } from "./useNativeBridge";
import { appVersion } from "./useSystemInfo";
import { UI_STABILITY_DELAY } from "@core/config";

/**
 * PWA MANAGER SERVICE (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Centralizes infrastructure-level PWA lifecycle and recovery logic.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * This service orchestrates Service Worker updates, cache purging, and
 * disaster recovery (factory resets). It acts as a Layer 1 core service,
 * ensuring infrastructure concerns are decoupled from feature-level logic.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 (@core)
 * - **Import Boundaries:** May import from Layer 1 (@core) and Layer 0 (@substrate).
 *   Imports from Shared (@shared) or Features (@features) are forbidden.
 *
 * Satisfies ADR Section II: Layer 1 Core services (Agnostic Infrastructure).
 * Satisfies ADR Section IV: Tiered Caching Protocol (Cache API management).
 */

/**
 * COMPOSABLE: usePwaManager
 *
 * @returns
 * - `notificationPermission`: Status of the browser's Notification API.
 * - `isPushSubscribed`: Indicates if the client has an active push subscription.
 * - `updateServiceWorker`: Ref containing the SW registration update function.
 * - `initPwaLifecycle`: Orchestrates SW registration and permission probing.
 * - `forceUpdate`: Triggers a manual Service Worker update check.
 * - `clearCache`: Purges the PWA asset cache and reloads.
 * - `factoryReset`: Destructive wipe of all local application state.
 */
export function usePwaManager() {
  const toast = useToast();
  const { bridge: nativeBridge } = useNativeBridge();

  const notificationPermission = ref<NotificationPermission | "unsupported">("default");
  const isPushSubscribed = ref(false);

  /**
   * Function to trigger a Service Worker reload/update.
   * Typically populated by 'virtual:pwa-register' in the feature layer.
   *
   * @param reload - Whether to force a full page reload after the update.
   */
  const updateServiceWorker = ref((reload?: boolean) => {
    console.log("[PWA] SW Update check initiated (no-op stub)", reload);
  });

  /**
   * Orchestrates the PWA lifecycle initialization.
   * Handles Service Worker registration and notification permission probing.
   */
  async function initPwaLifecycle() {
    // [THREAT:] Bypassing PWA logic in development/showcase mode to prevent
    // headless browser crashes during branding asset generation.
    if (!import.meta.env.PROD) return;

    // [DECISION LOG] Delaying execution avoids clashing with initial render/font loading
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
        } catch (swInitError) {
          console.warn("[PWA] SW Registration failed", swInitError);
        }
      }

      // Notification Probing
      if (typeof Notification !== "undefined") {
        notificationPermission.value = Notification.permission;

        if ("serviceWorker" in navigator) {
          try {
            const swRegistration = await navigator.serviceWorker.ready;
            const pushSubscription = await swRegistration.pushManager?.getSubscription();
            if (pushSubscription) isPushSubscribed.value = true;
          } catch (pushProbeError) {
            console.warn("[PWA] Push subscription probe failed", pushProbeError);
          }
        }
      } else {
        notificationPermission.value = "unsupported";
      }
    }, UI_STABILITY_DELAY);
  }

  /**
   * Triggers an explicit check for Service Worker updates.
   *
   * @remarks
   * Uses the native `navigator.serviceWorker` API. If a waiting worker is found,
   * it triggers an immediate skipWaiting via `updateServiceWorker(true)`.
   * Runs for all clients, including the native Android wrapper, because the PWA
   * content cached inside the WebView benefits from SW refreshes independently
   * of the APK shell version.
   *
   * @returns A promise that resolves when the update check completes.
   */
  async function forceUpdate(): Promise<void> {
    const activeToastId = toast.info("Checking for updates...");

    try {
      // [THREAT:] Browser environments without Service Worker support (e.g. non-HTTPS, or disabled).
      if ("serviceWorker" in navigator) {
        const serviceWorkerRegistration = await navigator.serviceWorker.getRegistration();

        if (!serviceWorkerRegistration) {
          // [DECISION LOG] No registration found usually means the app hasn't fully
          // booted or is in a broken state. Exit early to avoid null reference.
          toast.remove(activeToastId);
          toast.error("No active session found");
          return;
        }

        if (serviceWorkerRegistration.waiting) {
          // [DECISION LOG] An update was already downloaded and is ready to be applied.
          // Trigger immediate activation and reload.
          toast.remove(activeToastId);
          toast.success("Update ready! Reloading...");
          updateServiceWorker.value(true);
          return;
        }

        await serviceWorkerRegistration.update();

        if (serviceWorkerRegistration.installing || serviceWorkerRegistration.waiting) {
          toast.remove(activeToastId);
          toast.success("Update found! Downloading...");
        } else {
          toast.remove(activeToastId);
          toast.success("Clash Manager is up to date");
        }
      } else {
        toast.remove(activeToastId);
        toast.error("Service Worker not available");
      }
    } catch (swUpdateError: unknown) {
      const errorMessage = swUpdateError instanceof Error ? swUpdateError.message : String(swUpdateError);
      console.error("Update check failed", errorMessage);
      toast.remove(activeToastId);
      toast.error("Update check failed");
    }
  }

  /**
   * Resolves the exact release APK filename from the remote repository metadata.
   *
   * @remarks
   * **Dynamic Release Resolution Contract:**
   * - Queries `APK/release/latest.json` on the `Beta` branch.
   * - Relies on a network-isolated 3-second abort timeout to prevent blocking the UI
   *   indefinitely on severe network degradation or captive portals.
   * - Since Android companion apps are built with unique version and build suffixes
   *   (e.g., `clashmanager-v14.40.10+148.apk`), static filename guessing can fail.
   * - Satisfies ADR Section IV: Resilience & Operational Security (Offline Operations & State Recovery).
   *
   * @returns A Promise resolving to the exact filename string or a deterministic fallback.
   */
  async function resolveApkFilename(): Promise<string> {
    // [DECISION LOG] Fallback name is formatted deterministically from the build-time constant.
    const fallback = `clashmanager-v${appVersion}.apk`;
    try {
      // [THREAT:] Slow-network stagnation. Prevent download button from getting stuck in an infinite pending state.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(
        "https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/latest.json",
        { signal: controller.signal },
      );
      clearTimeout(timeoutId);

      // [THREAT:] Network errors or non-200 responses.
      if (!response.ok) return fallback;

      const latest = (await response.json()) as { filename?: string };
      // [DECISION LOG] Fall back to the old unsuffixed filename if the latest.json lacks the property.
      return latest.filename ?? fallback;
    } catch (resolveApkError: unknown) {
      // [DECISION LOG] Fail silently and return the fallback so a network hiccup never blocks a user.
      console.warn("[PWA] Dynamic APK resolution failed; utilizing fallback", resolveApkError);
      return fallback;
    }
  }

  /**
   * Triggers direct download of the versioned APK binary hosted in the repository.
   *
   * @remarks
   * **APK Update Contract:**
   * - Intended exclusively for native Android wrapper users to update their APK shells.
   * - Explicitly encodes the filename suffix (using `encodeURIComponent`) to handle special characters
   *   like `+` (the SemVer build metadata separator) smoothly without URL corruption.
   * - Prefers `downloadApkFile` on the native bridge when available, which uses Android's
   *   `DownloadManager` to fetch the binary natively without routing through a browser.
   * - Falls back to `openExternalUrl` for older APK builds that pre-date the DownloadManager bridge.
   * - Satisfies ADR Section IV: Hardware/Browser Brokering.
   *
   * @throws None - Catch-all blocks propagate failures gracefully to the user via toast notifications.
   * @returns A Promise that resolves when the download sequence is successfully launched.
   */
  async function downloadApk(): Promise<void> {
    const activeToastId = toast.info("Opening APK download...");
    try {
      // [DECISION LOG] Query the remote repository metadata to get the actual build-numbered filename.
      const filename = await resolveApkFilename();
      const isFallback = filename === `clashmanager-v${appVersion}.apk`;

      // [THREAT:] Special character URL corruption. Encoding handles the "+" build metadata separator smoothly.
      // [DECISION LOG] Bypassing the github.com redirect by linking directly to raw.githubusercontent.com.
      // If dynamic resolution fails, we redirect to the folder listing rather than a 404 URL.
      const apkUrl = isFallback
        ? "https://github.com/AlbiDR/Clash-Manager/tree/Beta/APK/release"
        : `https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/${encodeURIComponent(filename)}`;

      if (!isFallback && nativeBridge.value?.downloadApkFile) {
        // [DECISION LOG] Preferred path. DownloadManager fetches the binary natively,
        // saves it to Downloads, and shows a system notification. No browser involved.
        nativeBridge.value.downloadApkFile(apkUrl, filename);
      } else if (nativeBridge.value?.openExternalUrl) {
        // [DECISION LOG] Fallback for older APK builds that pre-date downloadApkFile,
        // or when isFallback is true and we want to open the directory page.
        nativeBridge.value.openExternalUrl(apkUrl);
      } else if (typeof window !== "undefined") {
        // [DECISION LOG] Browser fallback. Standard window location redirection for PWA installations.
        window.location.href = apkUrl;
      }

      toast.remove(activeToastId);
      if (isFallback) {
        toast.success("Opening APK release directory");
      } else {
        toast.success("APK download started");
      }
    } catch (downloadApkError: unknown) {
      // [THREAT:] Client window state modifications throwing or unexpected bridge failure.
      console.error("[PWA] Failed to dispatch APK download", downloadApkError);
      toast.remove(activeToastId);
      toast.error("Failed to open APK download");
    }
  }

  /**
   * Purges the Service Worker and Cache API assets.
   *
   * @param onCleanup - Optional callback for Layer 2/3 specific cleanup tasks.
   * @returns A promise that resolves after the purge (if confirmed).
   *
   * @remarks
   * This is a non-destructive recovery action. It unregisters all service workers
   * and deletes all named caches before triggering a hard reload.
   */
  async function clearCache(onCleanup?: () => void): Promise<void> {
    if (
      confirm(
        "Purge Asset Cache?\n\nThis will clear the Service Worker cache and reload the application. Your settings and data will be preserved.",
      )
    ) {
      // [DECISION LOG] 1. Unregister Workers: Forces the browser to discard the current control logic.
      if ("serviceWorker" in navigator) {
        const swRegistrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of swRegistrations) {
          await registration.unregister();
        }
      }

      // [DECISION LOG] 2. Delete Caches: Clears the 'Stale' or corrupted assets stored via CacheStorage.
      const pwaCacheNames = await caches.keys();
      await Promise.all(pwaCacheNames.map((cacheName) => caches.delete(cacheName)));

      // [DECISION LOG] 3. Optional Callback (e.g. for Layer 2 theme manifest cleanup)
      // Maintaining strict Layer 1 boundaries by delegating Layer 2 specific cleanup.
      if (onCleanup) onCleanup();

      window.location.reload();
    }
  }

  /**
   * Performs a total wipe of local application data.
   *
   * @param onCleanup - Optional callback for Layer 2/3 specific cleanup tasks.
   * @returns A promise that resolves after the reset (if confirmed).
   *
   * @remarks
   * Destructive action. Clears LocalStorage, SessionStorage, and the authoritative
   * IndexedDB store. Used to resolve deep state corruption.
   */
  async function factoryReset(onCleanup?: () => void): Promise<void> {
    if (
      confirm(
        "Reset Application Data?\n\nThis will clear local cache, indexedDB, and settings. Remote database state will NOT be affected.",
      )
    ) {
      // [DECISION LOG] 1. Unregister Workers: Forces the browser to discard logic and release IDB locks.
      if ("serviceWorker" in navigator) {
        try {
          const swRegistrations = await navigator.serviceWorker.getRegistrations();
          for (const registration of swRegistrations) {
            await registration.unregister();
          }
        } catch (serviceWorkerUnregisterError) {
          console.warn("[PWA] SW unregister failed during reset", serviceWorkerUnregisterError);
        }
      }

      // [DECISION LOG] 2. Delete Caches: Clears the 'Stale' or corrupted assets.
      try {
        const pwaCacheNames = await caches.keys();
        await Promise.all(pwaCacheNames.map((cacheName) => caches.delete(cacheName)));
      } catch (cacheError) {
        console.warn("[PWA] Cache delete failed during reset", cacheError);
      }

      // [DECISION LOG] 3. Clear Storage: Purge LocalStorage and SessionStorage.
      localStorage.clear();
      sessionStorage.clear();

      // [DECISION LOG] 4. Destroy IndexedDB: Purge active and legacy databases completely.
      try {
        if (typeof idb.destroyAll === "function") {
          await idb.destroyAll();
        } else {
          await idb.clear();
        }
      } catch (idbResetError) {
        console.warn("IDB destroyAll/clear failed", idbResetError);
      }

      // [DECISION LOG] 5. Optional Callback (e.g. for Layer 2 theme manifest cleanup)
      if (onCleanup) onCleanup();

      window.location.reload();
    }
  }

  return {
    notificationPermission,
    isPushSubscribed,
    updateServiceWorker,
    initPwaLifecycle,
    forceUpdate,
    downloadApk,
    clearCache,
    factoryReset,
  };
}
