// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * APK RELEASE RESOLVER SERVICE (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Centralizes dynamic APK release metadata and filename resolution.
 * Layer: Layer 1 (@core)
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * This service parses GitHub repository releases and metadata to resolve the latest
 * companion APK filename and binary download URLs for the hybrid Android wrapper.
 * Satisfies CleanStack Architecture Layer 1 standards.
 */

import {
  APK_LATEST_METADATA_URL,
  APK_RELEASE_CONTENTS_API_URL,
  APK_RESOLUTION_CACHE_TTL_MS,
  APK_FETCH_TIMEOUT_MS,
  type ApkReleaseDownload,
  type ApkResolutionCache,
  type GitHubReleaseContent,
  buildFreshUrl,
  isReleaseApkFilename,
  isReleaseVersion,
  isReleaseBuildNumber,
  isReleaseSizeBytes,
  isSha256Digest,
  buildApkDownloadUrl,
  buildSameOriginApkReleaseUrl,
  buildSameOriginApkDownloadUrl,
  selectNewestReleaseApk,
  selectNewestReleaseDownload,
} from "./apkResolverUtils";

// Re-export everything from apkResolverUtils to guarantee backward compatibility and zero broken imports.
export * from "./apkResolverUtils";

/**
 * Registry state holding the active memoized resolution result.
 * [DECISION LOG]: Kept private within module scope to prevent external mutation.
 */
let apkResolutionCache: ApkResolutionCache | undefined;

/**
 * Active promise pointer to deduplicate concurrent resolution requests.
 * [DECISION LOG]: Mitigates race conditions and prevents cache stampede.
 */
let pendingApkResolution: Promise<ApkReleaseDownload | undefined> | undefined;

/**
 * Performs a fresh fetch request, enforcing Cache-Control restrictions and abort timers.
 *
 * @param url - The resource target URL.
 * @param init - Optional configuration request mappings.
 * @returns Resolves with the network response.
 *
 * @remarks
 * [THREAT ANNOTATION]: Network Exhaustion/Stall Guard. Binds requests with a hard-timeout
 * abort controller and overrides storage directives with 'no-store' to guarantee fresh data ingress.
 */
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

/**
 * Queries GitHub's contents directory list API as an autonomous fallback route.
 *
 * @returns The found newest APK model, or undefined on failure.
 */
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

/**
 * Evaluates an individual metadata endpoint for a valid candidate filename.
 *
 * @param metadataUrl - Target metadata url string.
 * @param buildDownloadUrl - Factory mapping to construct download urls.
 * @param sourceName - Human identifier for diagnostic warnings.
 * @returns Structured release download mapping, or undefined.
 */
async function resolveApkReleaseFromMetadataUrl(
  metadataUrl: string,
  buildDownloadUrl: (filename: string) => string | undefined,
  sourceName: string,
): Promise<ApkReleaseDownload | undefined> {
  try {
    const response = await fetchFresh(metadataUrl);
    if (response.ok) {
      const latestReleaseMetadata = (await response.json()) as {
        buildNumber?: number;
        changelog?: string[] | string;
        filename?: string;
        sha256?: string;
        sizeBytes?: number;
        version?: string;
      };
      const downloadUrl = isReleaseApkFilename(latestReleaseMetadata.filename)
        ? buildDownloadUrl(latestReleaseMetadata.filename)
        : undefined;
      if (isReleaseApkFilename(latestReleaseMetadata.filename)) {
        if (!downloadUrl) return undefined;
        const changelog = Array.isArray(latestReleaseMetadata.changelog)
          ? latestReleaseMetadata.changelog.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
          : typeof latestReleaseMetadata.changelog === "string" && latestReleaseMetadata.changelog.trim().length > 0
            ? [latestReleaseMetadata.changelog]
            : undefined;
        return {
          buildNumber: isReleaseBuildNumber(latestReleaseMetadata.buildNumber)
            ? latestReleaseMetadata.buildNumber
            : undefined,
          changelog,
          filename: latestReleaseMetadata.filename,
          sha256: isSha256Digest(latestReleaseMetadata.sha256) ? latestReleaseMetadata.sha256.toLowerCase() : undefined,
          sizeBytes: isReleaseSizeBytes(latestReleaseMetadata.sizeBytes) ? latestReleaseMetadata.sizeBytes : undefined,
          url: downloadUrl,
          version: isReleaseVersion(latestReleaseMetadata.version) ? latestReleaseMetadata.version : undefined,
        };
      }
    }
  } catch (resolveApkError: unknown) {
    console.warn(`[PWA] ${sourceName} APK metadata resolution failed`, resolveApkError);
  }

  return undefined;
}

/**
 * Resolves companion updates against GitHub's latest.json metadata endpoint.
 *
 * @returns Matching release data, or undefined.
 */
async function resolveApkReleaseFromLatestMetadata(): Promise<ApkReleaseDownload | undefined> {
  return resolveApkReleaseFromMetadataUrl(APK_LATEST_METADATA_URL, buildApkDownloadUrl, "Remote latest.json");
}

/**
 * Resolves companion updates against same-origin's hosted latest.json metadata endpoint.
 *
 * @returns Matching same-origin release data, or undefined.
 */
async function resolveApkReleaseFromSameOriginMetadata(): Promise<ApkReleaseDownload | undefined> {
  const sameOriginMetadataUrl = buildSameOriginApkReleaseUrl("latest.json");
  if (!sameOriginMetadataUrl) return undefined;

  return resolveApkReleaseFromMetadataUrl(
    sameOriginMetadataUrl,
    buildSameOriginApkDownloadUrl,
    "Same-origin latest.json",
  );
}

/**
 * Uncached, multi-source resolution orchestration executed in parallel.
 *
 * @returns The absolute peak chronological release candidate found.
 *
 * @remarks
 * [DECISION LOG]: Runs three resolution workflows in parallel (Same-origin, GitHub API,
 * Remote latest.json metadata) to establish fault-tolerance against network failures or CDN outages.
 */
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

/**
 * Resolves the absolute newest APK companion release, utilizing caching and race-deduplication.
 *
 * @returns The newest verified download payload, or undefined.
 *
 * @remarks
 * [DECISION LOG]: Wraps concurrent queries into a single pending transaction promise
 * to prevent high-frequency cache stampedes. Enforces a sliding cache TTL expiration.
 */
export async function resolveLatestApkRelease(): Promise<ApkReleaseDownload | undefined> {
  const now = Date.now();
  if (apkResolutionCache && apkResolutionCache.expiresAt > now) {
    return {
      buildNumber: apkResolutionCache.buildNumber,
      changelog: apkResolutionCache.changelog,
      filename: apkResolutionCache.filename,
      sha256: apkResolutionCache.sha256,
      sizeBytes: apkResolutionCache.sizeBytes,
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
          changelog: release.changelog,
          filename: release.filename,
          sha256: release.sha256,
          sizeBytes: release.sizeBytes,
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

/**
 * Resolves only the companion filename segment of the newest verified release.
 *
 * @returns The companion file name, or undefined.
 */
export async function resolveLatestApkFilename(): Promise<string | undefined> {
  return (await resolveLatestApkRelease())?.filename;
}

/**
 * Clears active module cached structures during testing runs.
 * Only functional inside a designated test runtime environment.
 */
export function resetApkResolutionCacheForTests(): void {
  if (import.meta.env.TEST) {
    apkResolutionCache = undefined;
    pendingApkResolution = undefined;
  }
}
