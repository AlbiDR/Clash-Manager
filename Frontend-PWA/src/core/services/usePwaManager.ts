// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref } from "vue";
import { useToast } from "./useToast";
import { useConfirm } from "./useConfirm";
import { idb } from "./StorageService";
import { useNativeBridge } from "./useNativeBridge";
import { UI_STABILITY_DELAY } from "@core/config";

export const APK_RELEASE_RAW_BASE_URL = "https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release";
export const APK_LATEST_METADATA_URL = `${APK_RELEASE_RAW_BASE_URL}/latest.json`;
export const APK_RELEASE_CONTENTS_API_URL =
  "https://api.github.com/repos/AlbiDR/Clash-Manager/contents/APK/release?ref=Beta";
const APK_RELEASE_PAGES_PATH = "apk/release";
export const APK_RESOLUTION_CACHE_TTL_MS = 60000;
export const APK_METADATA_FETCH_TIMEOUT_MS = 3500;

type ApkResolutionCache = {
  buildNumber?: number;
  filename: string;
  url: string;
  version?: string;
  expiresAt: number;
};

type GitHubReleaseContent = {
  download_url?: string | null;
  name?: string;
  type?: string;
};

type ReleaseApkParts = {
  major: number;
  minor: number;
  patch: number;
  build: number;
};

let apkResolutionCache: ApkResolutionCache | undefined;
let pendingApkResolution: Promise<ApkReleaseDownload | undefined> | undefined;

type BeforeInstallPromptOutcome = "accepted" | "dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: BeforeInstallPromptOutcome; platform: string }>;
};

export type ApkReleaseDownload = {
  buildNumber?: number;
  filename: string;
  url: string;
  version?: string;
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

function buildFreshUrl(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
}

function isReleaseApkFilename(filename: string | undefined): filename is string {
  return typeof filename === "string" && /^clashmanager-v\d+\.\d+\.\d+\+\d+\.apk$/.test(filename);
}

function isReleaseVersion(version: string | undefined): version is string {
  return typeof version === "string" && /^\d+\.\d+\.\d+$/.test(version);
}

function isReleaseBuildNumber(buildNumber: number | undefined): buildNumber is number {
  return typeof buildNumber === "number" && Number.isInteger(buildNumber) && buildNumber > 0;
}

function buildApkDownloadUrl(filename: string, baseUrl = APK_RELEASE_RAW_BASE_URL): string {
  return `${baseUrl.replace(/\/$/, "")}/${encodeURIComponent(filename)}`;
}

function getSameOriginApkReleaseBaseUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;

  const origin = window.location?.origin;
  if (!origin || origin === "null") return undefined;

  try {
    return new URL(`${APK_RELEASE_PAGES_PATH}/`, new URL(import.meta.env.BASE_URL, origin)).toString();
  } catch (sameOriginUrlError: unknown) {
    console.warn("[PWA] Same-origin APK release URL unavailable", sameOriginUrlError);
    return undefined;
  }
}

function parseReleaseApkFilename(filename: string): ReleaseApkParts | undefined {
  const match = filename.match(/^clashmanager-v(\d+)\.(\d+)\.(\d+)\+(\d+)\.apk$/);
  if (!match) return undefined;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    build: Number(match[4]),
  };
}

function compareReleaseApkFilenames(a: string, b: string): number {
  const parsedA = parseReleaseApkFilename(a);
  const parsedB = parseReleaseApkFilename(b);
  if (!parsedA || !parsedB) return 0;

  return (
    parsedA.major - parsedB.major ||
    parsedA.minor - parsedB.minor ||
    parsedA.patch - parsedB.patch ||
    parsedA.build - parsedB.build
  );
}

async function fetchFresh(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), APK_METADATA_FETCH_TIMEOUT_MS);

  try {
    return await fetch(buildFreshUrl(url), {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function resolveLatestApkMetadataFromUrl(
  metadataUrl: string,
  downloadBaseUrl: string,
): Promise<ApkReleaseDownload | undefined> {
  try {
    const response = await fetchFresh(metadataUrl);
    if (!response.ok) return undefined;

    const metadata = (await response.json()) as {
      buildNumber?: number;
      filename?: string;
      version?: string;
    };
    if (!isReleaseApkFilename(metadata.filename)) return undefined;

    return {
      buildNumber: isReleaseBuildNumber(metadata.buildNumber) ? metadata.buildNumber : undefined,
      filename: metadata.filename,
      url: buildApkDownloadUrl(metadata.filename, downloadBaseUrl),
      version: isReleaseVersion(metadata.version) ? metadata.version : undefined,
    };
  } catch (metadataError: unknown) {
    console.warn("[PWA] APK latest metadata lookup failed", metadataUrl, metadataError);
    return undefined;
  }
}

async function resolveLatestApkMetadata(): Promise<ApkReleaseDownload | undefined> {
  const sameOriginBaseUrl = getSameOriginApkReleaseBaseUrl();
  const metadataCandidates = [
    ...(sameOriginBaseUrl ? [{
      downloadBaseUrl: sameOriginBaseUrl,
      metadataUrl: buildApkDownloadUrl("latest.json", sameOriginBaseUrl),
    }] : []),
    {
      downloadBaseUrl: APK_RELEASE_RAW_BASE_URL,
      metadataUrl: APK_LATEST_METADATA_URL,
    },
  ];

  const releases = (await Promise.all(
    metadataCandidates.map((candidate) =>
      resolveLatestApkMetadataFromUrl(candidate.metadataUrl, candidate.downloadBaseUrl),
    ),
  )).filter((release): release is ApkReleaseDownload => Boolean(release));

  return releases.sort((a, b) => compareReleaseApkFilenames(a.filename, b.filename)).at(-1);
}

async function resolveLatestApkFromContentsApi(): Promise<ApkReleaseDownload | undefined> {
  try {
    const response = await fetchFresh(APK_RELEASE_CONTENTS_API_URL);
    if (!response.ok) return undefined;

    const contents = (await response.json()) as GitHubReleaseContent[];
    if (!Array.isArray(contents)) return undefined;

    const filename = contents
      .flatMap((item) => item.type === "file" && isReleaseApkFilename(item.name) ? [item.name] : [])
      .sort(compareReleaseApkFilenames)
      .at(-1);

    return filename ? { filename, url: buildApkDownloadUrl(filename) } : undefined;
  } catch (contentsError: unknown) {
    console.warn("[PWA] APK contents lookup failed", contentsError);
    return undefined;
  }
}

async function resolveLatestApkReleaseUncached(): Promise<ApkReleaseDownload | undefined> {
  const [metadataRelease, contentsRelease] = await Promise.all([
    resolveLatestApkMetadata(),
    resolveLatestApkFromContentsApi(),
  ]);

  if (!metadataRelease) return contentsRelease;
  if (!contentsRelease) return metadataRelease;

  return compareReleaseApkFilenames(contentsRelease.filename, metadataRelease.filename) > 0
    ? contentsRelease
    : metadataRelease;
}

export async function resolveLatestApkRelease(): Promise<ApkReleaseDownload | undefined> {
  const now = Date.now();
  if (apkResolutionCache && apkResolutionCache.expiresAt > now) {
    return {
      buildNumber: apkResolutionCache.buildNumber,
      filename: apkResolutionCache.filename,
      url: apkResolutionCache.url,
      version: apkResolutionCache.version,
    };
  }
  if (pendingApkResolution) return pendingApkResolution;

  pendingApkResolution = resolveLatestApkReleaseUncached()
    .then((release) => {
      if (release) {
        apkResolutionCache = {
          buildNumber: release.buildNumber,
          filename: release.filename,
          url: release.url,
          version: release.version,
          expiresAt: Date.now() + APK_RESOLUTION_CACHE_TTL_MS,
        };
      }
      return release;
    })
    .finally(() => {
      pendingApkResolution = undefined;
    });

  return pendingApkResolution;
}

export async function resolveLatestApkFilename(): Promise<string | undefined> {
  return (await resolveLatestApkRelease())?.filename;
}

export function resetApkResolutionCacheForTests(): void {
  if (import.meta.env.TEST) {
    apkResolutionCache = undefined;
    pendingApkResolution = undefined;
  }
}

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

  function isInstalledApkCurrent(release: ApkReleaseDownload): boolean {
    const nativeBuildNumber = getNativeBuildNumber();
    if (!nativeBuildNumber || !release.buildNumber) return false;

    const nativeVersionName = getNativeVersionName();
    return nativeBuildNumber >= release.buildNumber &&
      (!release.version || !nativeVersionName || nativeVersionName === release.version);
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
      if (!release) {
        toast.remove(activeToastId);
        toast.error("Could not find latest APK");
        return;
      }
      if (isInstalledApkCurrent(release)) {
        toast.remove(activeToastId);
        toast.success("You already have the latest APK");
        return;
      }

      if (nativeBridge.value?.downloadApkFile) {
        // [DECISION LOG] Preferred path. DownloadManager fetches the binary natively,
        // saves it to Downloads, and shows a system notification. No browser involved.
        nativeBridge.value.downloadApkFile(release.url, release.filename);
      } else if (nativeBridge.value?.openExternalUrl) {
        // [DECISION LOG] Fallback for older APK builds that pre-date downloadApkFile.
        nativeBridge.value.openExternalUrl(release.url);
      } else if (typeof window !== "undefined") {
        // [DECISION LOG] Browser fallback. Standard window location redirection for PWA installations.
        window.location.href = release.url;
      }

      toast.remove(activeToastId);
      toast.success("APK download started");
    } catch (downloadApkError: unknown) {
      // [THREAT:] Client window state modifications throwing or unexpected bridge failure.
      console.error("[PWA] Failed to dispatch APK download", downloadApkError);
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
    downloadApk,
    installPwa,
    isPwaInstallAvailable,
    isPwaStandalone,
    clearCache,
    factoryReset,
  };
}
