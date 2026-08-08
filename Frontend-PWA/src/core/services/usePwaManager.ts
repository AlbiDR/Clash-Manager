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
export const APK_FETCH_TIMEOUT_MS = 10000;
export const APK_RESOLUTION_CACHE_TTL_MS = 60000;
export const APK_RELEASE_PATH = "APK/release";

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

type ApkResolutionCache = {
  filename: string;
  url: string;
  expiresAt: number;
};

let apkResolutionCache: ApkResolutionCache | undefined;
let pendingApkResolution: Promise<ApkReleaseDownload | undefined> | undefined;

export type ApkReleaseDownload = {
  filename: string;
  url: string;
};

export function buildFreshApkMetadataUrl(): string {
  return buildFreshUrl(APK_LATEST_METADATA_URL);
}

export function buildFreshUrl(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
}

export function isReleaseApkFilename(filename: string | undefined): filename is string {
  return typeof filename === "string" && /^clashmanager-v\d+\.\d+\.\d+\+\d+\.apk$/.test(filename);
}

export function buildApkDownloadUrl(filename: string): string {
  return `${APK_RELEASE_RAW_BASE_URL}/${encodeURIComponent(filename)}`;
}

export function buildSameOriginApkReleaseUrl(path: string): string | undefined {
  if (typeof window === "undefined") return undefined;

  try {
    const origin = window.location.origin || new URL(window.location.href).origin;
    const configuredBasePath = import.meta.env.BASE_URL;
    const basePath = configuredBasePath && configuredBasePath !== "/" ? configuredBasePath : "/Clash-Manager/";
    return new URL(`${APK_RELEASE_PATH}/${path}`, `${origin}${basePath}`).href;
  } catch {
    return undefined;
  }
}

export function buildSameOriginApkDownloadUrl(filename: string): string | undefined {
  return buildSameOriginApkReleaseUrl(encodeURIComponent(filename));
}

function isDirectApkDownloadUrl(url: string | null | undefined, filename: string): url is string {
  if (typeof url !== "string") return false;

  try {
    const parsedUrl = new URL(url);
    const expectedPathSuffix = `/AlbiDR/Clash-Manager/Beta/APK/release/${filename}`;
    return parsedUrl.protocol === "https:" &&
      parsedUrl.hostname === "raw.githubusercontent.com" &&
      decodeURIComponent(parsedUrl.pathname).endsWith(expectedPathSuffix);
  } catch {
    return false;
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

export function selectNewestReleaseApkFilename(contents: GitHubReleaseContent[]): string | undefined {
  return selectNewestReleaseApk(contents)?.filename;
}

export function selectNewestReleaseApk(contents: GitHubReleaseContent[]): ApkReleaseDownload | undefined {
  const filename = contents
    .flatMap((item) => item.type === "file" && isReleaseApkFilename(item.name) ? [item.name] : [])
    .sort(compareReleaseApkFilenames)
    .at(-1);

  if (!filename) return undefined;

  const matchingItem = contents.find((item) => item.name === filename);
  return {
    filename,
    url: isDirectApkDownloadUrl(matchingItem?.download_url, filename)
      ? matchingItem.download_url
      : buildApkDownloadUrl(filename),
  };
}

function selectNewestReleaseDownload(candidates: Array<ApkReleaseDownload | undefined>): ApkReleaseDownload | undefined {
  return candidates.reduce<ApkReleaseDownload | undefined>((newestRelease, candidate) => {
    if (!candidate) return newestRelease;
    if (!newestRelease) return candidate;

    return compareReleaseApkFilenames(candidate.filename, newestRelease.filename) > 0
      ? candidate
      : newestRelease;
  }, undefined);
}

async function fetchFresh(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), APK_FETCH_TIMEOUT_MS);
  const { headers: initHeaders, ...fetchInit } = init;
  const headers = new Headers(initHeaders);
  headers.set("Cache-Control", "no-cache");

  try {
    return await fetch(buildFreshUrl(url), {
      ...fetchInit,
      cache: "no-store",
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function resolveApkReleaseFromContentsApi(): Promise<ApkReleaseDownload | undefined> {
  try {
    const response = await fetchFresh(APK_RELEASE_CONTENTS_API_URL);
    if (!response.ok) return undefined;

    const contents = (await response.json()) as GitHubReleaseContent[];
    if (!Array.isArray(contents)) return undefined;

    return selectNewestReleaseApk(contents);
  } catch (contentsError: unknown) {
    console.warn("[PWA] APK contents fallback failed", contentsError);
    return undefined;
  }
}

async function resolveApkReleaseFromMetadataUrl(
  metadataUrl: string,
  buildDownloadUrl: (filename: string) => string | undefined,
  sourceName: string,
): Promise<ApkReleaseDownload | undefined> {
  try {
    const response = await fetchFresh(metadataUrl);
    if (response.ok) {
      const latestReleaseMetadata = (await response.json()) as { filename?: string };
      const downloadUrl = isReleaseApkFilename(latestReleaseMetadata.filename)
        ? buildDownloadUrl(latestReleaseMetadata.filename)
        : undefined;
      if (isReleaseApkFilename(latestReleaseMetadata.filename)) {
        if (!downloadUrl) return undefined;
        return {
          filename: latestReleaseMetadata.filename,
          url: downloadUrl,
        };
      }
    }
  } catch (resolveApkError: unknown) {
    console.warn(`[PWA] ${sourceName} APK metadata resolution failed`, resolveApkError);
  }

  return undefined;
}

async function resolveApkReleaseFromLatestMetadata(): Promise<ApkReleaseDownload | undefined> {
  return resolveApkReleaseFromMetadataUrl(APK_LATEST_METADATA_URL, buildApkDownloadUrl, "Remote latest.json");
}

async function resolveApkReleaseFromSameOriginMetadata(): Promise<ApkReleaseDownload | undefined> {
  const sameOriginMetadataUrl = buildSameOriginApkReleaseUrl("latest.json");
  if (!sameOriginMetadataUrl) return undefined;

  return resolveApkReleaseFromMetadataUrl(
    sameOriginMetadataUrl,
    buildSameOriginApkDownloadUrl,
    "Same-origin latest.json",
  );
}

async function resolveLatestApkReleaseUncached(): Promise<ApkReleaseDownload | undefined> {
  const [releaseFromSameOriginMetadata, releaseFromContentsApi, releaseFromLatestMetadata] = await Promise.all([
    resolveApkReleaseFromSameOriginMetadata(),
    resolveApkReleaseFromContentsApi(),
    resolveApkReleaseFromLatestMetadata(),
  ]);

  return selectNewestReleaseDownload([
    releaseFromSameOriginMetadata,
    releaseFromContentsApi,
    releaseFromLatestMetadata,
  ]);
}

export async function resolveLatestApkRelease(): Promise<ApkReleaseDownload | undefined> {
  const now = Date.now();
  if (apkResolutionCache && apkResolutionCache.expiresAt > now) {
    return {
      filename: apkResolutionCache.filename,
      url: apkResolutionCache.url,
    };
  }
  if (pendingApkResolution) return pendingApkResolution;

  pendingApkResolution = resolveLatestApkReleaseUncached()
    .then((release) => {
      if (release) {
        apkResolutionCache = {
          filename: release.filename,
          url: release.url,
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
  async function resolveApkRelease(): Promise<ApkReleaseDownload | undefined> {
    try {
      // [THREAT:] Stale latest.json can point at a deleted build after every release rotation.
      // The shared resolver prefers GitHub's live contents API, then falls back to latest.json.
      return await resolveLatestApkRelease();
    } catch (resolveApkError: unknown) {
      console.warn("[PWA] Dynamic APK resolution failed", resolveApkError);
      return undefined;
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
      const release = await resolveApkRelease();
      if (!release) {
        toast.remove(activeToastId);
        toast.error("Could not find latest APK");
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
    clearCache,
    factoryReset,
  };
}
