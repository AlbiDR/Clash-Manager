// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { computed, ref } from "vue";
import { useToast } from "./useToast";
import { useNativeBridge } from "./useNativeBridge";
import {
  isReleaseBuildNumber,
  isReleaseVersion,
  parseReleaseApkFilename,
  resolveLatestApkRelease,
  type ApkReleaseDownload,
} from "./apkResolver";

export type ApkUpdateState = "idle" | "checking" | "available" | "current" | "blocked" | "mismatch" | "error";

const MIN_NATIVE_APK_DOWNLOAD_RESULT_BUILD = 191;

/**
 * APK MANAGER SERVICE (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Centralizes infrastructure-level native APK shell update management.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * Decoupled from PWA manager lifecycle routines. Manages APK metadata resolution,
 * installed vs published release comparison, download dispatch, and bridge status.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 (@core)
 * - **Import Boundaries:** May import from Layer 1 (@core) and Layer 0 (@substrate).
 *   Imports from Shared (@shared) or Features (@features) are forbidden.
 *
 * Satisfies ADR Section II: Layer 1 Core services (Agnostic Infrastructure).
 * Satisfies ADR Section IV: Hardware/Browser Brokering.
 */

/**
 * COMPOSABLE: useApkManager
 *
 * @returns State and helper methods to query and apply native APK shell updates.
 */
export function useApkManager() {
  const toast = useToast();
  const { bridge: nativeBridge } = useNativeBridge();

  const latestApkRelease = ref<ApkReleaseDownload>();
  const apkUpdateState = ref<ApkUpdateState>("idle");
  const apkUpdateMessage = ref("APK status not checked");
  const apkUpdateLastCheckedAt = ref<number>();

  /**
   * Resolves the single versioned release APK published by the release workflow.
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
    return parts.major * 1000 + parts.minor * 100 + parts.patch * 10;
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
    const detail = buildNumber ? `build ${buildNumber}` : versionCode ? `code ${versionCode}` : "native";
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
        nativeBridge.value.openExternalUrl(release.url);
        apkUpdateMessage.value = hasNativeDownloadManager
          ? "Browser download opened for legacy updater shell"
          : "Browser download opened to update native shell";
      } else if (typeof window !== "undefined") {
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
      console.error("[PWA] Failed to dispatch APK download", downloadApkError);
      apkUpdateState.value = "error";
      apkUpdateMessage.value = "Could not start APK download";
      toast.remove(activeToastId);
      toast.error("Failed to open APK download");
    }
  }

  return {
    latestApkRelease,
    apkUpdateState,
    apkUpdateMessage,
    apkUpdateLastCheckedAt,
    installedApkLabel,
    latestApkLabel,
    apkDirectDownloadUrl,
    apkArtifactLabel,
    apkFeedSourceLabel,
    apkChangelog,
    resolveApkRelease,
    checkApkUpdate,
    downloadApk,
  };
}
