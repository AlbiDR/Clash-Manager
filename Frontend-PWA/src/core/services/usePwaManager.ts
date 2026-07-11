// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref } from "vue";
import { useToast } from "./useToast";
import { idb } from "./StorageService";
import { useNativeBridge } from "./useNativeBridge";

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
 * - `updateServiceWorker`: Ref containing the SW registration update function.
 * - `forceUpdate`: Triggers a manual Service Worker update check.
 * - `clearCache`: Purges the PWA asset cache and reloads.
 * - `factoryReset`: Destructive wipe of all local application state.
 */
export function usePwaManager() {
  const toast = useToast();
  const { isNativeWrapper, bridge: nativeBridge } = useNativeBridge();

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
   * Triggers an explicit check for Service Worker updates.
   *
   * @remarks
   * Uses the native `navigator.serviceWorker` API. If a waiting worker is found,
   * it triggers an immediate skipWaiting via `updateServiceWorker(true)`.
   *
   * @returns A promise that resolves when the update check completes.
   */
  async function forceUpdate(): Promise<void> {
    if (isNativeWrapper.value) {
      const activeToastId = toast.info("Opening download page for the latest APK...");
      try {
        const downloadUrl = "https://github.com/AlbiDR/Clash-Manager/releases/latest";
        if (nativeBridge.value?.openExternalUrl) {
          nativeBridge.value.openExternalUrl(downloadUrl);
        } else if (typeof window !== "undefined") {
          window.location.href = downloadUrl;
        }
        toast.remove(activeToastId);
        toast.success("Redirected to download page");
      } catch (err: unknown) {
        toast.remove(activeToastId);
        toast.error("Failed to redirect to download page");
      }
      return;
    }

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
    updateServiceWorker,
    forceUpdate,
    clearCache,
    factoryReset,
  };
}
