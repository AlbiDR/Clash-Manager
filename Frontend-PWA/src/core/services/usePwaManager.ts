// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref } from "vue";
import { useToast } from "./useToast";
import { useConfirm } from "./useConfirm";
import { idb } from "./StorageService";
import { UI_STABILITY_DELAY } from "@core/config";
import { yieldToInteractionFrame } from "../utils/scheduling";
import { useApkManager, type ApkUpdateState } from "./useApkManager";

type BeforeInstallPromptOutcome = "accepted" | "dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: BeforeInstallPromptOutcome; platform: string }>;
};

const deferredInstallPrompt = ref<BeforeInstallPromptEvent>();
const isPwaInstallAvailable = ref(false);
const isPwaStandalone = ref(false);
let installPromptListenerBound = false;

function readPwaStandaloneState(): boolean {
  if (typeof window === "undefined") return false;

  return window.matchMedia?.("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator && window.navigator.standalone === true);
}

function bindInstallPromptListener(): void {
  if (installPromptListenerBound || typeof window === "undefined") return;
  installPromptListenerBound = true;
  isPwaStandalone.value = readPwaStandaloneState();

  const standaloneMediaQuery = window.matchMedia?.("(display-mode: standalone)");
  standaloneMediaQuery?.addEventListener?.("change", () => {
    isPwaStandalone.value = readPwaStandaloneState();
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt.value = event as BeforeInstallPromptEvent;
    isPwaInstallAvailable.value = true;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt.value = undefined;
    isPwaInstallAvailable.value = false;
    isPwaStandalone.value = true;
  });
}

bindInstallPromptListener();

export {
  APK_RELEASE_RAW_BASE_URL,
  APK_LATEST_METADATA_URL,
  APK_RELEASE_CONTENTS_API_URL,
  APK_FETCH_TIMEOUT_MS,
  APK_RESOLUTION_CACHE_TTL_MS,
  APK_RELEASE_PATH,
  type GitHubReleaseContent,
  type ReleaseApkParts,
  type ApkResolutionCache,
  type ApkReleaseDownload,
  buildFreshApkMetadataUrl,
  buildFreshUrl,
  isReleaseApkFilename,
  isReleaseBuildNumber,
  isReleaseVersion,
  buildApkDownloadUrl,
  buildSameOriginApkReleaseUrl,
  buildSameOriginApkDownloadUrl,
  selectNewestReleaseApkFilename,
  selectNewestReleaseApk,
  resolveLatestApkRelease,
  resolveLatestApkFilename,
  resetApkResolutionCacheForTests,
} from "./apkResolver";

export { useApkManager, type ApkUpdateState };

export function resetPwaInstallPromptForTests(): void {
  if (import.meta.env.TEST) {
    deferredInstallPrompt.value = undefined;
    isPwaInstallAvailable.value = false;
    isPwaStandalone.value = false;
  }
}

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
 * - `installPwa`: Opens the browser-managed PWA install prompt when available.
 * - `clearCache`: Purges the PWA asset cache and reloads.
 * - `factoryReset`: Destructive wipe of all local application state.
 */
export function usePwaManager() {
  const toast = useToast();
  const { confirm } = useConfirm();
  const apkManager = useApkManager();

  const notificationPermission = ref<NotificationPermission | "unsupported">("default");
  const isPushSubscribed = ref(false);

  /**
   * Function to trigger a Service Worker reload/update.
   * Typically populated by 'virtual:pwa-register' in the feature layer.
   *
   * @param shouldForceReload - Whether to force a full page reload after the update.
   */
  const updateServiceWorker = ref((shouldForceReload?: boolean) => {
    console.log("[PWA] SW Update check initiated (no-op stub)", shouldForceReload);
  });

  /**
   * Orchestrates the PWA lifecycle initialization.
   * Handles Service Worker registration and notification permission probing.
   */
  async function initPwaLifecycle() {
    if (!import.meta.env.PROD) return;

    setTimeout(async () => {
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
   * @returns A promise that resolves when the update check completes.
   */
  async function forceUpdate(): Promise<void> {
    const activeToastId = toast.info("Checking for updates...");
    await yieldToInteractionFrame();

    try {
      if ("serviceWorker" in navigator) {
        const serviceWorkerRegistration = await navigator.serviceWorker.getRegistration();

        if (!serviceWorkerRegistration) {
          toast.remove(activeToastId);
          toast.error("No active session found");
          return;
        }

        if (serviceWorkerRegistration.waiting) {
          toast.remove(activeToastId);
          toast.success("Update ready! Reloading...");
          updateServiceWorker.value(true);
          return;
        }

        await serviceWorkerRegistration.update();

        await apkManager.checkApkUpdate();

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
   * Opens the browser-managed install prompt for eligible PWA clients.
   */
  async function installPwa(): Promise<void> {
    const installPrompt = deferredInstallPrompt.value;
    if (!installPrompt) {
      toast.info("Use your browser menu to install Clash Manager");
      return;
    }

    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      deferredInstallPrompt.value = undefined;
      isPwaInstallAvailable.value = false;

      if (choice.outcome === "accepted") {
        toast.success("PWA install started");
      } else {
        toast.info("PWA install dismissed");
      }
    } catch (installError: unknown) {
      console.error("[PWA] Install prompt failed", installError);
      deferredInstallPrompt.value = undefined;
      isPwaInstallAvailable.value = false;
      toast.error("Failed to open install prompt");
    }
  }

  /**
   * Purges the Service Worker and Cache API assets.
   */
  async function clearCache(onCleanupCallback?: () => void): Promise<void> {
    const isClearCacheConfirmed = await confirm({
      title: "Purge Asset Cache?",
      message: "This will clear the Service Worker cache and reload the application. Your settings and data will be preserved.",
      confirmLabel: "Purge",
    });

    if (isClearCacheConfirmed) {
      await yieldToInteractionFrame();

      if ("serviceWorker" in navigator) {
        const swRegistrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of swRegistrations) {
          await registration.unregister();
        }
      }

      const pwaCacheNames = await caches.keys();
      await Promise.all(pwaCacheNames.map((cacheName) => caches.delete(cacheName)));

      if (onCleanupCallback) onCleanupCallback();

      window.location.reload();
    }
  }

  /**
   * Performs a total wipe of local application data.
   */
  async function factoryReset(onCleanupCallback?: () => void): Promise<void> {
    const isFactoryResetConfirmed = await confirm({
      title: "Reset Application Data?",
      message: "This will clear local cache, indexedDB, and settings. Remote database state will NOT be affected.",
      confirmLabel: "Reset",
      tone: "danger",
    });

    if (isFactoryResetConfirmed) {
      await yieldToInteractionFrame();

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

      try {
        const pwaCacheNames = await caches.keys();
        await Promise.all(pwaCacheNames.map((cacheName) => caches.delete(cacheName)));
      } catch (cacheError) {
        console.warn("[PWA] Cache delete failed during reset", cacheError);
      }

      localStorage.clear();
      sessionStorage.clear();

      try {
        if (typeof idb.destroyAll === "function") {
          await idb.destroyAll();
        } else {
          await idb.clear();
        }
      } catch (idbResetError) {
        console.warn("IDB destroyAll/clear failed", idbResetError);
      }

      if (onCleanupCallback) onCleanupCallback();

      window.location.reload();
    }
  }

  return {
    notificationPermission,
    isPushSubscribed,
    updateServiceWorker,
    initPwaLifecycle,
    forceUpdate,
    ...apkManager,
    installPwa,
    isPwaInstallAvailable,
    isPwaStandalone,
    clearCache,
    factoryReset,
  };
}
