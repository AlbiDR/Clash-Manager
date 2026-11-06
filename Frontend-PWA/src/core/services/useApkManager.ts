// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { computed, ref } from "vue";
import { useToast } from "./useToast";
import { useNativeBridge } from "./useNativeBridge";
import {
  isReleaseBuildNumber,
  isReleaseVersion,
  resolveLatestApkRelease,
  type ApkReleaseDownload,
} from "./apkResolver";
import {
  MIN_NATIVE_APK_DOWNLOAD_RESULT_BUILD,
  formatApkArtifactLabel,
  formatApkFeedSourceLabel,
  formatInstalledApkLabel,
  getInstalledReleaseComparison as compareInstalledRelease,
  getReleaseVersionLabel,
  isInstalledApkCurrent as checkIsInstalledCurrent,
  isPublishedApkOlderThanInstalled as checkIsPublishedOlder,
} from "./apkManagerUtils";

/**
 * Semantic states for native APK update checks and downloads.
 */
export type ApkUpdateState = "idle" | "checking" | "available" | "current" | "blocked" | "mismatch" | "error";

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
   * Compares installed native shell metadata against a published release target.
   *
   * @param release - Published APK metadata model to compare against.
   * @returns Negative if installed is older, positive if installed is newer, zero if identical, or undefined if unresolvable.
   *
   * @remarks
   * Satisfies ADR Section III: Validation Boundaries and ADR Section IV: Hardware/Browser Brokering.
   * Extracts version and build number via the native WebView bridge before delegating to `compareInstalledRelease`.
   */
  function getInstalledReleaseComparison(release: ApkReleaseDownload): number | undefined {
    // [DECISION LOG] Delegates semantic comparison to apkManagerUtils with bridge-extracted version and build.
    return compareInstalledRelease(getNativeVersionName(), getNativeBuildNumber(), release);
  }

  /**
   * Checks if the currently installed native shell is up to date relative to the published release.
   *
   * @param release - Target release download metadata.
   * @returns True if installed version and build match or exceed the published release.
   *
   * @remarks
   * Evaluates installed native app status against remote release data to prevent redundant downloads.
   */
  function isInstalledApkCurrent(release: ApkReleaseDownload): boolean {
    // [DECISION LOG] Evaluates equality or forward progression of installed shell relative to published artifact.
    return checkIsInstalledCurrent(getNativeVersionName(), getNativeBuildNumber(), release);
  }

  /**
   * Checks if the published update feed is older than the currently installed native shell.
   *
   * @param release - Target release download metadata.
   * @returns True if published release version/build is strictly older than what is currently running.
   *
   * @remarks
   * [THREAT ANNOTATION: Stale Feed Rollback] Protects against stale CDN caches or superseded
   * metadata endpoints offering a downgrade that could corrupt local app databases or state.
   */
  function isPublishedApkOlderThanInstalled(release: ApkReleaseDownload): boolean {
    // [GUARD] Protects against stale CDN caches proposing a version downgrade.
    return checkIsPublishedOlder(getNativeVersionName(), getNativeBuildNumber(), release);
  }

  /**
   * Formatted display label for the installed native shell environment.
   *
   * @remarks
   * Concatenates version name, version code, and build number into a unified diagnostic badge.
   */
  const installedApkLabel = computed(() => {
    // [DECISION LOG] Resolves triple-attribute bridge tuple into standardized label.
    return formatInstalledApkLabel(getNativeVersionName(), getNativeVersionCode(), getNativeBuildNumber());
  });

  /**
   * Formatted display label for the latest published APK release.
   *
   * @remarks
   * Provides version and build number representation (e.g., "v1.2.3 (45)") for the active download target.
   */
  const latestApkLabel = computed(() => getReleaseVersionLabel(latestApkRelease.value));

  /**
   * Direct download URL for the active APK release, guarded against stale/current versions.
   *
   * @remarks
   * Returns an empty string if the download target is already installed, older than the installed shell,
   * or if no release is currently resolved.
   */
  // [THREAT:] Prevents downloading stale release feeds over a newer installed APK shell.
  const apkDirectDownloadUrl = computed(() => {
    const release = latestApkRelease.value;
    if (!release) return "";
    // [GUARD] Inhibit direct download link when update feed represents a downgrade.
    if (isPublishedApkOlderThanInstalled(release)) return "";
    // [GUARD] Inhibit download link when installed APK already matches or exceeds published build.
    if (isInstalledApkCurrent(release)) return "";
    return release.url;
  });

  /**
   * Formatted summary label detailing target file size and SHA-256 checksum preview.
   *
   * @remarks
   * Provides human-readable byte magnitude and cryptographic fingerprint indicator for user verification.
   */
  const apkArtifactLabel = computed(() => formatApkArtifactLabel(latestApkRelease.value));

  /**
   * Display label detailing the feed source and URL.
   *
   * @remarks
   * Names the origin source (Same-Origin, GitHub Contents API, or Remote metadata) that supplied the release.
   */
  const apkFeedSourceLabel = computed(() => formatApkFeedSourceLabel(latestApkRelease.value));

  /**
   * List of change items associated with the latest release.
   *
   * @remarks
   * Normalizes string or array changelog entries from the release payload into an array of strings.
   */
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
    getInstalledReleaseComparison,
    isInstalledApkCurrent,
    isPublishedApkOlderThanInstalled,
  };
}
