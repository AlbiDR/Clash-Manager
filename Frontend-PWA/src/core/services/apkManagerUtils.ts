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
 */

import { formatBytes } from "../utils/text";
import { parseReleaseApkFilename, type ApkReleaseDownload } from "./apkResolver";

/**
 * Minimum native build number capable of receiving native download manager result callbacks.
 * Builds prior to 191 require fallback to browser or legacy external URL triggers.
 */
export const MIN_NATIVE_APK_DOWNLOAD_RESULT_BUILD = 191;

/**
 * Compares two semantic version strings ("X.Y.Z").
 *
 * @param firstVersion - The primary version string to compare.
 * @param secondVersion - The baseline version string to compare against.
 * @returns Positive integer if firstVersion > secondVersion, negative if firstVersion < secondVersion, 0 if equal.
 */
export function compareReleaseVersions(firstVersion: string, secondVersion: string): number {
  const first = firstVersion.split(".").map(Number);
  const second = secondVersion.split(".").map(Number);
  return (
    (first[0] ?? 0) - (second[0] ?? 0) ||
    (first[1] ?? 0) - (second[1] ?? 0) ||
    (first[2] ?? 0) - (second[2] ?? 0)
  );
}

/**
 * Compares installed native shell metadata against a published release target.
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
  if (!release) return undefined;

  if (nativeVersionName && release.version) {
    const versionComparison = compareReleaseVersions(nativeVersionName, release.version);
    if (versionComparison !== 0) return versionComparison;
  }

  if (nativeBuildNumber && release.buildNumber) {
    return nativeBuildNumber - release.buildNumber;
  }

  if (nativeVersionName && release.version && nativeVersionName === release.version) {
    return 0;
  }

  return undefined;
}

/**
 * Checks if the currently installed native shell is up to date relative to the published release.
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
  if (!release) return false;
  const comparison = getInstalledReleaseComparison(nativeVersionName, nativeBuildNumber, release);
  return comparison !== undefined && comparison >= 0;
}

/**
 * Checks if the published update feed is older than the currently installed native shell.
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
  if (!release) return false;
  const comparison = getInstalledReleaseComparison(nativeVersionName, nativeBuildNumber, release);
  return comparison !== undefined && comparison > 0;
}

/**
 * Generates a descriptive display label for a given APK release object.
 *
 * @param release - Target release or undefined.
 * @returns Formatted label string (e.g. "v14.46.2 (191)").
 */
export function getReleaseVersionLabel(release: ApkReleaseDownload | undefined): string {
  if (!release) return "Not checked";
  const version = release.version || parseReleaseApkFilename(release.filename)
    ? `v${release.version ?? release.filename.replace(/^clashmanager-v/, "").replace(/\.apk$/, "")}`
    : release.filename;
  return release.buildNumber ? `${version} (${release.buildNumber})` : version;
}

/**
 * Formats a descriptive display label for the installed native shell environment.
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
  if (!nativeVersionName && !nativeVersionCode && !nativeBuildNumber) return "Web/PWA session";
  const detail = nativeBuildNumber ? `build ${nativeBuildNumber}` : nativeVersionCode ? `code ${nativeVersionCode}` : "native";
  return `${nativeVersionName ? `v${nativeVersionName}` : "Native APK"} (${detail})`;
}

/**
 * Formats a summary label detailing target file size and SHA-256 checksum preview.
 *
 * @param release - Target release metadata or undefined.
 * @returns Formatted artifact label string.
 */
export function formatApkArtifactLabel(release: ApkReleaseDownload | undefined): string {
  if (!release) return "No APK metadata loaded";
  const checksum = release.sha256 ? `SHA-256 ${release.sha256.slice(0, 8)}...` : "checksum unavailable";
  return `${formatBytes(release.sizeBytes)} · ${checksum}`;
}

/**
 * Formats display label detailing feed source and URL.
 *
 * @param release - Target release metadata or undefined.
 * @returns Formatted feed source label string.
 */
export function formatApkFeedSourceLabel(release: ApkReleaseDownload | undefined): string {
  if (!release?.sourceName) return "";
  return release.sourceUrl ? `${release.sourceName}: ${release.sourceUrl}` : release.sourceName;
}
