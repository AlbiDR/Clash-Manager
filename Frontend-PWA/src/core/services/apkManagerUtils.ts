// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * APK MANAGER UTILITIES (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Pure helper functions, formatting utilities, and version comparison
 * logic for APK update management.
 * Layer: Layer 1 (@core)
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * Satisfies CleanStack Architecture Layer 1 standards. Decoupled from reactive state.
 * Satisfies ADR Section I (Foundations) and ADR Section IV (Update Lifecycle).
 */

import { formatBytes } from "../utils/text";
import { parseReleaseApkFilename, type ApkReleaseDownload } from "./apkResolver";

/**
 * Minimum native build number capable of receiving native download manager result callbacks.
 * Builds prior to 191 require fallback to browser or legacy external URL triggers.
 *
 * @remarks
 * [THREAT:] Silent Download Failure. Legacy native shells (< build 191) lack
 * BroadcastReceiver bindings for DownloadManager completion, causing in-app
 * update progress listeners to hang indefinitely.
 *
 * [DECISION LOG] Build 191 introduced native intent handlers for completed APK downloads.
 */
export const MIN_NATIVE_APK_DOWNLOAD_RESULT_BUILD = 191;

/**
 * Compares two semantic version strings ("X.Y.Z").
 *
 * @remarks
 * Satisfies ADR Section IV: Update Lifecycle Boundaries.
 * Operates purely on numeric tuple comparisons of major, minor, and patch components.
 *
 * @param firstVersion - The primary version string to compare.
 * @param secondVersion - The baseline version string to compare against.
 * @returns Positive integer if firstVersion > secondVersion, negative if firstVersion < secondVersion, 0 if equal.
 */
export function compareReleaseVersions(firstVersion: string, secondVersion: string): number {
  // Split version strings into numeric tuples; fallback to 0 for missing sub-components
  const first = firstVersion.split(".").map(Number);
  const second = secondVersion.split(".").map(Number);
  // Compare major, then minor, then patch sequentially
  return (
    (first[0] ?? 0) - (second[0] ?? 0) ||
    (first[1] ?? 0) - (second[1] ?? 0) ||
    (first[2] ?? 0) - (second[2] ?? 0)
  );
}

/**
 * Compares installed native shell metadata against a published release target.
 *
 * @remarks
 * [THREAT:] Mixed Version/Build Drift. Native Android builds may share semantic version
 * strings (e.g. "14.55.0") across sequential build numbers. Semantic versioning takes
 * precedence; build numbers break ties.
 *
 * [DECISION LOG] Evaluates semver first. If versions match or are absent, compares numeric build numbers.
 *
 * @param nativeVersionName - Installed app version string (e.g., "14.46.2"), if available.
 * @param nativeBuildNumber - Installed app numeric build identifier, if available.
 * @param release - Published APK release download target.
 * @returns Positive integer if installed > published, negative if installed < published, 0 if equal, or undefined if indeterminable.
 */
export function getInstalledReleaseComparison(
  nativeVersionName: string | undefined,
  nativeBuildNumber: number | undefined,
  release: ApkReleaseDownload | undefined,
): number | undefined {
  // Cannot perform comparison without target release metadata
  if (!release) return undefined;

  // Primary check: compare semantic version strings when both exist
  if (nativeVersionName && release.version) {
    const versionComparison = compareReleaseVersions(nativeVersionName, release.version);
    // Non-zero result indicates version precedence without needing build number check
    if (versionComparison !== 0) return versionComparison;
  }

  // Secondary check: compare numeric build numbers when semantic versions match or are missing
  if (nativeBuildNumber && release.buildNumber) {
    return nativeBuildNumber - release.buildNumber;
  }

  // Fallback check: exact match when semantic version names match verbatim
  if (nativeVersionName && release.version && nativeVersionName === release.version) {
    return 0;
  }

  // Insufficient metadata to determine version comparison
  return undefined;
}

/**
 * Checks if the currently installed native shell is up to date relative to the published release.
 *
 * @remarks
 * Satisfies ADR Section IV: Update Lifecycle (Client Currency Guard).
 *
 * @param nativeVersionName - Installed app version string, if available.
 * @param nativeBuildNumber - Installed app numeric build identifier, if available.
 * @param release - Published APK release target.
 * @returns True if installed version is equal to or newer than published release.
 */
export function isInstalledApkCurrent(
  nativeVersionName: string | undefined,
  nativeBuildNumber: number | undefined,
  release: ApkReleaseDownload | undefined,
): boolean {
  // Absence of release metadata implies currency check cannot confirm update need
  if (!release) return false;
  const comparison = getInstalledReleaseComparison(nativeVersionName, nativeBuildNumber, release);
  // Non-negative comparison value indicates installed binary is equal or newer
  return comparison !== undefined && comparison >= 0;
}

/**
 * Checks if the published update feed is older than the currently installed native shell.
 *
 * @remarks
 * [DECISION LOG] Prevents downgrade prompts when running local development or unreleased native builds.
 *
 * @param nativeVersionName - Installed app version string, if available.
 * @param nativeBuildNumber - Installed app numeric build identifier, if available.
 * @param release - Published APK release target.
 * @returns True if installed version is strictly newer than the published release.
 */
export function isPublishedApkOlderThanInstalled(
  nativeVersionName: string | undefined,
  nativeBuildNumber: number | undefined,
  release: ApkReleaseDownload | undefined,
): boolean {
  // Absence of release metadata means feed age cannot be determined
  if (!release) return false;
  const comparison = getInstalledReleaseComparison(nativeVersionName, nativeBuildNumber, release);
  // Strictly positive comparison value confirms installed binary is newer than feed
  return comparison !== undefined && comparison > 0;
}

/**
 * Generates a descriptive display label for a given APK release object.
 *
 * @remarks
 * [DECISION LOG] Strips filename prefix/suffix as fallback when structured release version is missing.
 *
 * @param release - Target release or undefined.
 * @returns Formatted label string (e.g. "v14.46.2 (191)").
 */
export function getReleaseVersionLabel(release: ApkReleaseDownload | undefined): string {
  // Return fallback string when no release metadata is provided
  if (!release) return "Not checked";
  // Derive version string from structured field or sanitize filename
  const version = release.version || parseReleaseApkFilename(release.filename)
    ? `v${release.version ?? release.filename.replace(/^clashmanager-v/, "").replace(/\.apk$/, "")}`
    : release.filename;
  // Append build number in parentheses when available
  return release.buildNumber ? `${version} (${release.buildNumber})` : version;
}

/**
 * Formats a descriptive display label for the installed native shell environment.
 *
 * @remarks
 * [DECISION LOG] Distinguishes Web/PWA sessions from native Android WebView wrappers.
 *
 * @param nativeVersionName - Installed app version string, if available.
 * @param nativeVersionCode - Installed app version code, if available.
 * @param nativeBuildNumber - Installed app numeric build identifier, if available.
 * @returns Display label string (e.g. "v14.46.2 (build 191)" or "Web/PWA session").
 */
export function formatInstalledApkLabel(
  nativeVersionName: string | undefined,
  nativeVersionCode: number | undefined,
  nativeBuildNumber: number | undefined,
): string {
  // Absence of all native markers signifies a browser/PWA session
  if (!nativeVersionName && !nativeVersionCode && !nativeBuildNumber) return "Web/PWA session";
  // Prioritize build number, then version code, then generic native label
  const detail = nativeBuildNumber ? `build ${nativeBuildNumber}` : nativeVersionCode ? `code ${nativeVersionCode}` : "native";
  return `${nativeVersionName ? `v${nativeVersionName}` : "Native APK"} (${detail})`;
}

/**
 * Formats a summary label detailing target file size and SHA-256 checksum preview.
 *
 * @remarks
 * Satisfies ADR Section III: Verification & Security Display Boundaries.
 *
 * @param release - Target release metadata or undefined.
 * @returns Formatted artifact label string.
 */
export function formatApkArtifactLabel(release: ApkReleaseDownload | undefined): string {
  // Return placeholder label when release metadata is unavailable
  if (!release) return "No APK metadata loaded";
  // Truncate SHA-256 checksum to 8 characters for compact UI presentation
  const checksum = release.sha256 ? `SHA-256 ${release.sha256.slice(0, 8)}...` : "checksum unavailable";
  return `${formatBytes(release.sizeBytes)} · ${checksum}`;
}

/**
 * Formats display label detailing feed source and URL.
 *
 * @remarks
 * [DECISION LOG] Combines feed name and endpoint URL for debugging update origins.
 *
 * @param release - Target release metadata or undefined.
 * @returns Formatted feed source label string.
 */
export function formatApkFeedSourceLabel(release: ApkReleaseDownload | undefined): string {
  // Empty string returned if source name is missing
  if (!release?.sourceName) return "";
  // Concatenate source name and URL when both are available
  return release.sourceUrl ? `${release.sourceName}: ${release.sourceUrl}` : release.sourceName;
}
