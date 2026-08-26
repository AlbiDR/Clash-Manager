// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { computed, ref } from "vue";
import { formatBytes } from "../utils/text";
import { useToast } from "./useToast";
import { useNativeBridge } from "./useNativeBridge";
import {
  isReleaseBuildNumber,
  isReleaseVersion,
  parseReleaseApkFilename,
  resolveLatestApkRelease,
  type ApkReleaseDownload,
} from "./apkResolver";

/**
 * Semantic states for native APK update checks and downloads.
 */
export type ApkUpdateState = "idle" | "checking" | "available" | "current" | "blocked" | "mismatch" | "error";

/**
 * Minimum native build number capable of receiving native download manager result callbacks.
 * Builds prior to 191 require fallback to browser or legacy external URL triggers.
 */
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
 * @remarks
 * Orchestrates native Android APK version checking, version comparison,
 * permission verification, and download dispatching through native bridge or browser fallback.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 (@core)
 * - **Hardware Brokering:** Interacts directly with `useNativeBridge` to inspect native build attributes and invoke package installers.
 *
 * @returns Object containing reactive state, computed metadata labels, update check trigger, and download dispatcher.
 */
export function useApkManager() {
  const toast = useToast();
  const { bridge: nativeBridge } = useNativeBridge();

  /** Reactive reference to the latest resolved published APK download metadata. */
  const latestApkRelease = ref<ApkReleaseDownload>();
  /** Current status state of the APK update pipeline. */
  const apkUpdateState = ref<ApkUpdateState>("idle");
  /** Human-readable status message reflecting the current update state. */
  const apkUpdateMessage = ref("APK status not checked");
  /** Timestamp (epoch ms) of the last successful or attempted update check. */
  const apkUpdateLastCheckedAt = ref<number>();

  /**
   * Resolves the single versioned release APK published by the release workflow.
   *
   * @returns A Promise resolving to the latest versioned APK download target, or undefined on failure.
   */
  async function resolveApkRelease(): Promise<ApkReleaseDownload | undefined> {
    try {
      return await resolveLatestApkRelease();
    } catch (resolveApkError: unknown) {
      console.warn("[PWA] APK release resolution failed", resolveApkError);
      return undefined;
    }
  }

  /**
   * Extracts and validates the installed native app version name from the Android WebView bridge.
   *
   * @returns The semantic version string if valid, or undefined if running in a standard web session.
   */
  function getNativeVersionName(): string | undefined {
    const versionName = nativeBridge.value?.getAppVersionName?.();
    return isReleaseVersion(versionName) ? versionName : undefined;
  }

  /**
   * Extracts and validates the installed native app build number from the Android WebView bridge.
   *
   * @returns The numeric build number if valid, or undefined.
   */
  function getNativeBuildNumber(): number | undefined {
    const buildNumber = nativeBridge.value?.getBuildNumber?.();
    return isReleaseBuildNumber(buildNumber) ? buildNumber : undefined;
  }

  /**
   * Extracts and validates the installed native app version code from the Android WebView bridge.
   *
   * @returns The numeric version code if valid, or undefined.
   */
  function getNativeVersionCode(): number | undefined {
    const versionCode = nativeBridge.value?.getAppVersionCode?.();
    return isReleaseBuildNumber(versionCode) ? versionCode : undefined;
  }

  /**
   * Calculates a numeric version code representation from a release filename.
   *
   * @param release - Target APK release payload.
   * @returns Calculated numeric version code (major * 1000 + minor * 100 + patch * 10) or undefined if unparsable.
   */
  function getReleaseVersionCode(release: ApkReleaseDownload): number | undefined {
    const parts = parseReleaseApkFilename(release.filename);
    if (!parts) return undefined;
    return parts.major * 1000 + parts.minor * 100 + parts.patch * 10;
  }

  /**
   * Compares two semantic version strings ("X.Y.Z").
   *
   * @param firstVersion - The primary version string to compare.
   * @param secondVersion - The baseline version string to compare against.
   * @returns Positive integer if firstVersion > secondVersion, negative if firstVersion < secondVersion, 0 if equal.
   */
  function compareReleaseVersions(firstVersion: string, secondVersion: string): number {
    const first = firstVersion.split(".").map(Number);
    const second = secondVersion.split(".").map(Number);
    return (first[0] ?? 0) - (second[0] ?? 0) ||
      (first[1] ?? 0) - (second[1] ?? 0) ||
      (first[2] ?? 0) - (second[2] ?? 0);
  }

  /**
   * Compares installed native shell metadata against a published release target.
   *
   * @param release - Published APK release download target.
   * @returns Positive integer if installed > published, negative if installed < published, 0 if equal, or undefined if indeterminable.
   */
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

  /**
   * Checks if the currently installed native shell is up to date relative to the published release.
   *
   * @param release - Published APK release target.
   * @returns True if installed version is equal to or newer than published release.
   */
  function isInstalledApkCurrent(release: ApkReleaseDownload): boolean {
    const comparison = getInstalledReleaseComparison(release);
    return comparison !== undefined && comparison >= 0;
  }

  /**
   * Checks if the published update feed is older than the currently installed native shell.
   *
   * @param release - Published APK release target.
   * @returns True if installed version is strictly newer than the published release.
   */
  function isPublishedApkOlderThanInstalled(release: ApkReleaseDownload): boolean {
    const comparison = getInstalledReleaseComparison(release);
    return comparison !== undefined && comparison > 0;
  }

  /**
   * Generates a descriptive display label for a given APK release object.
   *
   * @param release - Target release or undefined.
   * @returns Formatted label string (e.g. "v14.46.2 (191)").
   */
  function getReleaseVersionLabel(release: ApkReleaseDownload | undefined): string {
    if (!release) return "Not checked";
    const version = release.version || parseReleaseApkFilename(release.filename)
      ? `v${release.version ?? release.filename.replace(/^clashmanager-v/, "").replace(/\.apk$/, "")}`
      : release.filename;
    return release.buildNumber ? `${version} (${release.buildNumber})` : version;
  }

  /** Formatted display label for the installed native shell environment. */
  const installedApkLabel = computed(() => {
    const versionName = getNativeVersionName();
    const versionCode = getNativeVersionCode();
    const buildNumber = getNativeBuildNumber();
    if (!versionName && !versionCode && !buildNumber) return "Web/PWA session";
    const detail = buildNumber ? `build ${buildNumber}` : versionCode ? `code ${versionCode}` : "native";
    return `${versionName ? `v${versionName}` : "Native APK"} (${detail})`;
  });

  /** Formatted display label for the latest published APK release. */
  const latestApkLabel = computed(() => getReleaseVersionLabel(latestApkRelease.value));

  /**
   * Direct download URL for the active APK release, guarded against stale/current versions.
   */
  // [THREAT:] Prevents downloading stale release feeds over a newer installed APK shell.
  const apkDirectDownloadUrl = computed(() => {
    const release = latestApkRelease.value;
    if (!release) return "";
    if (isPublishedApkOlderThanInstalled(release)) return "";
    if (isInstalledApkCurrent(release)) return "";
    return release.url;
  });

  /** Formatted summary label detailing target file size and SHA-256 checksum preview. */
  const apkArtifactLabel = computed(() => {
    const release = latestApkRelease.value;
    if (!release) return "No APK metadata loaded";
    const checksum = release.sha256 ? `SHA-256 ${release.sha256.slice(0, 8)}...` : "checksum unavailable";
    return `${formatBytes(release.sizeBytes)} · ${checksum}`;
  });

  /** Display label detailing the feed source and URL. */
  const apkFeedSourceLabel = computed(() => {
    const release = latestApkRelease.value;
    if (!release?.sourceName) return "";
    return release.sourceUrl ? `${release.sourceName}: ${release.sourceUrl}` : release.sourceName;
  });

  /** List of change items associated with the latest release. */
  const apkChangelog = computed(() => latestApkRelease.value?.changelog ?? []);

  /**
   * Queries latest published release metadata and evaluates update state.
   *
   * @remarks
   * Handles checks for feed mismatch, current version parity, and Android package install permission gating.
   *
   * @sideeffects
   * Updates `apkUpdateState`, `apkUpdateMessage`, `apkUpdateLastCheckedAt`, and `latestApkRelease`.
   */
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

    // [DECISION LOG] Halt update pipeline if published release feed is older than local native shell.
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

    // [THREAT:] Android 8.0+ requires explicit unknown app install approval per package origin.
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
   * Triggers the APK download flow, delegating to the native download manager or browser fallback.
   *
   * @remarks
   * Evaluates native bridge capabilities, build number thresholds (`MIN_NATIVE_APK_DOWNLOAD_RESULT_BUILD`),
   * and permission states before dispatching download or opening external URL triggers.
   *
   * @sideeffects
   * Displays toast notifications and triggers native Android bridge actions or window location redirects.
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

      // [GUARD] Block download if release feed is older than installed shell.
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

      // [GUARD] Redirect user to Android settings if package install permission is missing.
      if (nativeBridge.value?.canRequestPackageInstalls && !nativeBridge.value.canRequestPackageInstalls()) {
        apkUpdateState.value = "blocked";
        apkUpdateMessage.value = "Android install approval required";
        toast.remove(activeToastId);
        toast.info("Allow APK updates in Android, then tap Download Update again");
        nativeBridge.value.openPackageInstallSettings?.();
        return;
      }

      // [FALLBACK] Trigger external browser download for legacy native shells lacking package install checks.
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
      // [PERF] Delegate to native download manager for modern builds (>= 191).
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
