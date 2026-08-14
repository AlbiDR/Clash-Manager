// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { computed, ref } from "vue";
import { useToast } from "./useToast";
import { useConfirm } from "./useConfirm";
import { idb } from "./StorageService";
import { useNativeBridge } from "./useNativeBridge";
import { UI_STABILITY_DELAY } from "@core/config";
import { yieldToInteractionFrame } from "../utils/scheduling";
import {
  isReleaseBuildNumber,
  isReleaseVersion,
  parseReleaseApkFilename,
  resolveLatestApkRelease,
  type ApkReleaseDownload,
} from "./apkResolver";

type BeforeInstallPromptOutcome = "accepted" | "dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: BeforeInstallPromptOutcome; platform: string }>;
};

type ApkUpdateState = "idle" | "checking" | "available" | "current" | "blocked" | "mismatch" | "error";

const MIN_NATIVE_APK_DOWNLOAD_RESULT_BUILD = 192;

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
  const { bridge: nativeBridge } = useNativeBridge();

  const notificationPermission = ref<NotificationPermission | "unsupported">("default");
  const isPushSubscribed = ref(false);
  const latestApkRelease = ref<ApkReleaseDownload>();
  const apkUpdateState = ref<ApkUpdateState>("idle");
  const apkUpdateMessage = ref("APK status not checked");
  const apkUpdateLastCheckedAt = ref<number>();

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
    await yieldToInteractionFrame();

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

        if (nativeBridge.value) await checkApkUpdate();

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
   * Resolves the single versioned release APK published by the release workflow.
   *
   * @remarks
   * **Versioned Latest APK Contract:**
   * - Uses `APK/release/latest.json` to resolve the exact versioned APK filename.
   * - Falls back to the GitHub contents API listing if `latest.json` is stale or unavailable.
   * - Never opens the repository or release directory when resolution fails.
   * - Satisfies ADR Section IV: Resilience & Operational Security (Offline Operations & State Recovery).
   *
   * @returns A Promise resolving to the latest versioned APK download target.
   */
  async function resolveApkRelease(): Promise<ApkReleaseDownload | undefined> {
    try {
      return await resolveLatestApkRelease();
    } catch (resolveApkError: unknown) {
      console.warn("[PWA] APK release resolution failed", resolveApkError);
      return undefined;
    }
  }

  function getNativeVersionName(): string | undefined {
    const versionName = nativeBridge.value?.getAppVersionName?.();
    return isReleaseVersion(versionName) ? versionName : undefined;
  }

  function getNativeBuildNumber(): number | undefined {
    const buildNumber = nativeBridge.value?.getBuildNumber?.();
    return isReleaseBuildNumber(buildNumber) ? buildNumber : undefined;
  }

  function getNativeVersionCode(): number | undefined {
    const versionCode = nativeBridge.value?.getAppVersionCode?.();
    return isReleaseBuildNumber(versionCode) ? versionCode : undefined;
  }

  function getReleaseVersionCode(release: ApkReleaseDownload): number | undefined {
    const parts = parseReleaseApkFilename(release.filename);
    if (!parts) return undefined;
    return parts.major * 1000 + parts.minor * 100 + parts.patch;
  }

  function compareReleaseVersions(firstVersion: string, secondVersion: string): number {
    const first = firstVersion.split(".").map(Number);
    const second = secondVersion.split(".").map(Number);
    return (first[0] ?? 0) - (second[0] ?? 0) ||
      (first[1] ?? 0) - (second[1] ?? 0) ||
      (first[2] ?? 0) - (second[2] ?? 0);
  }

  function getInstalledReleaseComparison(release: ApkReleaseDownload): number | undefined {
    const nativeVersionCode = getNativeVersionCode();
    const releaseVersionCode = getReleaseVersionCode(release);
    if (nativeVersionCode && releaseVersionCode) {
      const versionCodeComparison = nativeVersionCode - releaseVersionCode;
      if (versionCodeComparison !== 0) return versionCodeComparison;
    }

    const nativeVersionName = getNativeVersionName();
    if (nativeVersionName && release.version) {
      const versionComparison = compareReleaseVersions(nativeVersionName, release.version);
      if (versionComparison !== 0) return versionComparison;
    }

    const nativeBuildNumber = getNativeBuildNumber();
    if (nativeBuildNumber && release.buildNumber) return nativeBuildNumber - release.buildNumber;

    if (nativeVersionName && release.version && nativeVersionName === release.version) return 0;
    return undefined;
  }

  function isInstalledApkCurrent(release: ApkReleaseDownload): boolean {
    const comparison = getInstalledReleaseComparison(release);
    return comparison !== undefined && comparison >= 0;
  }

  function isPublishedApkOlderThanInstalled(release: ApkReleaseDownload): boolean {
    const comparison = getInstalledReleaseComparison(release);
    return comparison !== undefined && comparison > 0;
  }

  function getReleaseVersionLabel(release: ApkReleaseDownload | undefined): string {
    if (!release) return "Not checked";
    const version = release.version || parseReleaseApkFilename(release.filename)
      ? `v${release.version ?? release.filename.replace(/^clashmanager-v/, "").replace(/\.apk$/, "")}`
      : release.filename;
    return release.buildNumber ? `${version} (${release.buildNumber})` : version;
  }

  function formatApkSize(sizeBytes: number | undefined): string {
    if (!sizeBytes) return "Size unknown";
    if (sizeBytes >= 1024 * 1024) return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
    return `${Math.round(sizeBytes / 1024)} KB`;
  }

  const installedApkLabel = computed(() => {
    const versionName = getNativeVersionName();
    const versionCode = getNativeVersionCode();
    const buildNumber = getNativeBuildNumber();
    if (!versionName && !versionCode && !buildNumber) return "Web/PWA session";
    const detail = versionCode ? `code ${versionCode}` : buildNumber ? `build ${buildNumber}` : "native";
    return `${versionName ? `v${versionName}` : "Native APK"} (${detail})`;
  });

  const latestApkLabel = computed(() => getReleaseVersionLabel(latestApkRelease.value));
  const apkDirectDownloadUrl = computed(() => {
    const release = latestApkRelease.value;
    if (!release) return "";
    if (isPublishedApkOlderThanInstalled(release)) return "";
    if (isInstalledApkCurrent(release)) return "";
    return release.url;
  });
  const apkArtifactLabel = computed(() => {
    const release = latestApkRelease.value;
    if (!release) return "No APK metadata loaded";
    const checksum = release.sha256 ? `SHA-256 ${release.sha256.slice(0, 8)}...` : "checksum unavailable";
    return `${formatApkSize(release.sizeBytes)} · ${checksum}`;
  });
  const apkFeedSourceLabel = computed(() => {
    const release = latestApkRelease.value;
    if (!release?.sourceName) return "";
    return release.sourceUrl ? `${release.sourceName}: ${release.sourceUrl}` : release.sourceName;
  });
  const apkChangelog = computed(() => latestApkRelease.value?.changelog ?? []);

  async function checkApkUpdate(): Promise<void> {
    apkUpdateState.value = "checking";
    apkUpdateMessage.value = "Checking native APK...";

    const release = await resolveApkRelease();
    apkUpdateLastCheckedAt.value = Date.now();
    latestApkRelease.value = release;

    if (!release) {
      apkUpdateState.value = "error";
      apkUpdateMessage.value = "Published APK metadata unavailable";
      return;
    }

    if (isPublishedApkOlderThanInstalled(release)) {
      apkUpdateState.value = "mismatch";
      apkUpdateMessage.value = "Release metadata mismatch";
      console.warn("[PWA] APK update feed is older than installed shell", {
        installed: installedApkLabel.value,
        published: getReleaseVersionLabel(release),
        sourceName: release.sourceName,
        sourceUrl: release.sourceUrl,
      });
      return;
    }

    if (isInstalledApkCurrent(release)) {
      apkUpdateState.value = "current";
      apkUpdateMessage.value = "Installed APK is current";
      return;
    }

    if (nativeBridge.value?.canRequestPackageInstalls && !nativeBridge.value.canRequestPackageInstalls()) {
      apkUpdateState.value = "blocked";
      apkUpdateMessage.value = "Android install approval required";
      return;
    }

    if (nativeBridge.value && typeof nativeBridge.value.canRequestPackageInstalls !== "function") {
      apkUpdateState.value = "blocked";
      apkUpdateMessage.value = "Install-capable shell update required";
      return;
    }

    apkUpdateState.value = "available";
    apkUpdateMessage.value = `APK update ready: ${getReleaseVersionLabel(release)}`;
  }

  /**
   * Triggers direct download of the latest versioned APK binary hosted in the repository.
   *
   * @remarks
   * **APK Update Contract:**
   * - Intended exclusively for native Android wrapper users to update their APK shells.
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
      const release = await resolveApkRelease();
      latestApkRelease.value = release;
      apkUpdateLastCheckedAt.value = Date.now();
      if (!release) {
        apkUpdateState.value = "error";
        apkUpdateMessage.value = "Published APK metadata unavailable";
        toast.remove(activeToastId);
        toast.error("Could not find latest APK");
        return;
      }
      if (isPublishedApkOlderThanInstalled(release)) {
        apkUpdateState.value = "mismatch";
        apkUpdateMessage.value = "Release metadata mismatch";
        console.warn("[PWA] APK update download blocked because feed is older than installed shell", {
          installed: installedApkLabel.value,
          published: getReleaseVersionLabel(release),
          sourceName: release.sourceName,
          sourceUrl: release.sourceUrl,
        });
        toast.remove(activeToastId);
        toast.error("Update feed is stale; download blocked");
        return;
      }

      if (isInstalledApkCurrent(release)) {
        apkUpdateState.value = "current";
        apkUpdateMessage.value = "Installed APK is current";
        toast.remove(activeToastId);
        toast.success("You already have this APK or newer");
        return;
      }

      if (nativeBridge.value?.canRequestPackageInstalls && !nativeBridge.value.canRequestPackageInstalls()) {
        apkUpdateState.value = "blocked";
        apkUpdateMessage.value = "Android install approval required";
        toast.remove(activeToastId);
        toast.info("Allow APK updates in Android, then tap Download Update again");
        nativeBridge.value.openPackageInstallSettings?.();
        return;
      }

      if (nativeBridge.value && typeof nativeBridge.value.canRequestPackageInstalls !== "function") {
        if (nativeBridge.value.openExternalUrl) {
          nativeBridge.value.openExternalUrl(release.url);
          toast.remove(activeToastId);
          apkUpdateState.value = "blocked";
          apkUpdateMessage.value = "Browser download opened to update native shell";
          toast.info("Install the APK from your browser to unlock native updater permissions");
          return;
        }
      }

      const hasNativeDownloadManager = typeof nativeBridge.value?.downloadApkFile === "function";
      const nativeBuildNumber = getNativeBuildNumber();
      const shouldUseNativeDownloadManager =
        hasNativeDownloadManager &&
        (!nativeBuildNumber || nativeBuildNumber >= MIN_NATIVE_APK_DOWNLOAD_RESULT_BUILD);

      if (shouldUseNativeDownloadManager) {
        // [DECISION LOG] Preferred path. DownloadManager fetches the binary natively,
        // saves it to Downloads, and the wrapper opens Android's installer on completion.
        const nativeDownloadAccepted = nativeBridge.value.downloadApkFile(release.url, release.filename, release.sha256);
        if (nativeDownloadAccepted === false) {
          if (nativeBridge.value.openExternalUrl) {
            nativeBridge.value.openExternalUrl(release.url);
          } else if (typeof window !== "undefined") {
            window.location.href = release.url;
          }
          apkUpdateMessage.value = "Browser download opened after native updater declined";
        }
      } else if (nativeBridge.value?.openExternalUrl) {
        // [DECISION LOG] Fallback for older APK builds that pre-date downloadApkFile.
        nativeBridge.value.openExternalUrl(release.url);
        apkUpdateMessage.value = hasNativeDownloadManager
          ? "Browser download opened for legacy updater shell"
          : "Browser download opened to update native shell";
      } else if (typeof window !== "undefined") {
        // [DECISION LOG] Browser fallback. Standard window location redirection for PWA installations.
        window.location.href = release.url;
        apkUpdateMessage.value = "Browser download opened";
      }

      toast.remove(activeToastId);
      apkUpdateState.value = "available";
      if (!apkUpdateMessage.value.includes("Browser download opened")) {
        apkUpdateMessage.value = release.sha256 ? "Download started with checksum verification" : "Download started without checksum metadata";
      }
      toast.success("APK download started");
    } catch (downloadApkError: unknown) {
      // [THREAT:] Client window state modifications throwing or unexpected bridge failure.
      console.error("[PWA] Failed to dispatch APK download", downloadApkError);
      apkUpdateState.value = "error";
      apkUpdateMessage.value = "Could not start APK download";
      toast.remove(activeToastId);
      toast.error("Failed to open APK download");
    }
  }

  /**
   * Opens the browser-managed install prompt for eligible PWA clients.
   *
   * @remarks
   * The install prompt is captured from `beforeinstallprompt` and can be used
   * only once. Native wrappers never expose this path; installed PWAs also stop
   * surfacing it through the browser.
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
   *
   * @param onCleanupCallback - Optional callback for Layer 2/3 specific cleanup tasks.
   * @returns A promise that resolves after the purge (if confirmed).
   *
   * @remarks
   * This is a non-destructive recovery action. It unregisters all service workers
   * and deletes all named caches before triggering a hard reload.
   */
  async function clearCache(onCleanupCallback?: () => void): Promise<void> {
    const isClearCacheConfirmed = await confirm({
      title: "Purge Asset Cache?",
      message: "This will clear the Service Worker cache and reload the application. Your settings and data will be preserved.",
      confirmLabel: "Purge",
    });

    if (isClearCacheConfirmed) {
      await yieldToInteractionFrame();

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
      if (onCleanupCallback) onCleanupCallback();

      window.location.reload();
    }
  }

  /**
   * Performs a total wipe of local application data.
   *
   * @param onCleanupCallback - Optional callback for Layer 2/3 specific cleanup tasks.
   * @returns A promise that resolves after the reset (if confirmed).
   *
   * @remarks
   * Destructive action. Clears LocalStorage, SessionStorage, and the authoritative
   * IndexedDB store. Used to resolve deep state corruption.
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
    checkApkUpdate,
    downloadApk,
    apkUpdateState,
    apkUpdateMessage,
    apkUpdateLastCheckedAt,
    installedApkLabel,
    latestApkLabel,
    apkDirectDownloadUrl,
    apkArtifactLabel,
    apkFeedSourceLabel,
    apkChangelog,
    installPwa,
    isPwaInstallAvailable,
    isPwaStandalone,
    clearCache,
    factoryReset,
  };
}
