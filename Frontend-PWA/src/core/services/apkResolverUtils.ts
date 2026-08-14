// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * APK RELEASE RESOLVER UTILITIES (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Houses pure utilities, constants, types, and helpers for APK resolution.
 * Layer: Layer 1 (@core)
 * ----------------------------------------------------------------------------
 */

/**
 * The base raw content URL for companion APK binary releases on GitHub.
 * Used for direct binary downloads bypassing GitHub redirect performance drops.
 */
export const APK_RELEASE_RAW_BASE_URL = "https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release";

/**
 * The remote URL serving the latest companion APK's metadata JSON.
 */
export const APK_LATEST_METADATA_URL = `${APK_RELEASE_RAW_BASE_URL}/latest.json`;

/**
 * GitHub API repository contents URL to fetch listed files in the APK/release path.
 */
export const APK_RELEASE_CONTENTS_API_URL =
  "https://api.github.com/repos/AlbiDR/Clash-Manager/contents/APK/release?ref=Beta";

/**
 * Request abort timeout threshold in milliseconds to prevent stalling the PWA shell on low connectivity.
 */
export const APK_FETCH_TIMEOUT_MS = 10000;

/**
 * Time-to-live cache duration in milliseconds to throttle API query volume and prevent rate limiting.
 */
export const APK_RESOLUTION_CACHE_TTL_MS = 60000;

/**
 * Filesystem/URL path suffix mapped for locally hosted companion releases.
 */
export const APK_RELEASE_PATH = "apk/release";

/**
 * Interface representing metadata of files returned from GitHub contents API.
 */
export type GitHubReleaseContent = {
  /**
   * The raw binary download URL.
   */
  download_url?: string | null;
  /**
   * The filename of the released asset.
   */
  name?: string;
  /**
   * File type classifier (e.g., "file", "dir").
   */
  type?: string;
};

/**
 * Parsed version segments extracted from a standardized release APK filename.
 */
export type ReleaseApkParts = {
  /**
   * Major version segment indicating breaking architectural revisions.
   */
  major: number;
  /**
   * Minor version segment indicating functional enhancement iterations.
   */
  minor: number;
  /**
   * Patch version segment indicating minor fixes and corrections.
   */
  patch: number;
  /**
   * Numeric internal Android build identifier.
   */
  build: number;
};

/**
 * Cached structure to hold resolved APK details and eliminate redundant API calls.
 */
export type ApkResolutionCache = {
  /**
   * Optional Android build number from latest.json.
   */
  buildNumber?: number;
  /**
   * The resolved newest companion filename.
   */
  filename: string;
  /**
   * Optional release notes surfaced in Settings.
   */
  changelog?: string[];
  /**
   * Optional SHA-256 digest for the APK binary.
   */
  sha256?: string;
  /**
   * Optional binary size in bytes.
   */
  sizeBytes?: number;
  /**
   * Human-readable endpoint family that produced the selected release metadata.
   */
  sourceName?: string;
  /**
   * Base endpoint URL that produced the selected release metadata.
   */
  sourceUrl?: string;
  /**
   * The direct binary or fallback URL to fetch the APK.
   */
  url: string;
  /**
   * Optional semantic app version from latest.json.
   */
  version?: string;
  /**
   * Unix epoch timestamp representing cache invalidation deadline.
   */
  expiresAt: number;
};

/**
 * Resolved APK release metadata representing filename and matched secure download URL.
 */
export type ApkReleaseDownload = {
  /**
   * Optional Android build number from latest.json.
   */
  buildNumber?: number;
  /**
   * The verified APK filename.
   */
  filename: string;
  /**
   * Optional release notes surfaced in Settings.
   */
  changelog?: string[];
  /**
   * Optional SHA-256 digest for the APK binary.
   */
  sha256?: string;
  /**
   * Optional binary size in bytes.
   */
  sizeBytes?: number;
  /**
   * Human-readable endpoint family that produced the selected release metadata.
   */
  sourceName?: string;
  /**
   * Base endpoint URL that produced the selected release metadata.
   */
  sourceUrl?: string;
  /**
   * The validated secure URL pointing to the file.
   */
  url: string;
  /**
   * Optional semantic app version from latest.json.
   */
  version?: string;
};

/**
 * Generates a cache-busted request URL targeting the remote latest metadata JSON.
 *
 * @returns The cache-busted latest.json metadata URL.
 */
export function buildFreshApkMetadataUrl(): string {
  return buildFreshUrl(APK_LATEST_METADATA_URL);
}

/**
 * Appends a millisecond timestamp cache-buster parameter to a URL string.
 *
 * @param url - The original URL string to mutate.
 * @returns The cache-busted URL string.
 *
 * @remarks
 * [DECISION LOG]: Enforces cache-busting to bypass aggressive service worker or CDN
 * caching layers, guaranteeing real-time resolution of critical APK updates.
 */
export function buildFreshUrl(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
}

/**
 * Validates whether a file name matches the strict companion APK semantic format.
 *
 * @param filename - The filename to validate.
 * @returns Boolean representing string match validity.
 *
 * @remarks
 * [THREAT ANNOTATION]: Prevents arbitrary string injection and malicious file-hijack
 * attempts by forcing strict conformity with the standard 'clashmanager-v{major}.{minor}.{patch}+{build}.apk' scheme.
 */
export function isReleaseApkFilename(filename: string | undefined): filename is string {
  return typeof filename === "string" && /^clashmanager-v\d+\.\d+\.\d+\+\d+\.apk$/.test(filename);
}

export function isReleaseVersion(version: string | undefined): version is string {
  return typeof version === "string" && /^\d+\.\d+\.\d+$/.test(version);
}

export function isReleaseBuildNumber(buildNumber: number | undefined): buildNumber is number {
  return typeof buildNumber === "number" && Number.isInteger(buildNumber) && buildNumber > 0;
}

export function isSha256Digest(value: string | undefined): value is string {
  return typeof value === "string" && /^[a-fA-F0-9]{64}$/.test(value);
}

export function isReleaseSizeBytes(value: number | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * Builds the canonical public remote URL for downloading a specific release file.
 *
 * @param filename - The target filename.
 * @returns The public raw GitHub user content URL.
 */
export function buildApkDownloadUrl(filename: string): string {
  return `${APK_RELEASE_RAW_BASE_URL}/${encodeURIComponent(filename)}`;
}

/**
 * Resolves the absolute path for companion releases hosted on the same origins.
 *
 * @param path - The target release path segment or asset file.
 * @returns The resolved origin-matching URL, or undefined under non-browser SSR runtimes.
 *
 * @remarks
 * [THREAT ANNOTATION]: SSR Hydration Safety boundary. Performs explicit checks on `window`
 * reference presence, preventing node-environment crashes when rendering views server-side.
 */
export function buildSameOriginApkReleaseUrl(path: string): string | undefined {
  if (typeof window === "undefined") return undefined;

  try {
    const origin = window.location.origin || new URL(window.location.href).origin;
    const configuredBasePath = import.meta.env.BASE_URL;
    // [DECISION LOG]: Fallback to standard /Clash-Manager/ subdirectory if base URL is root.
    const basePath = configuredBasePath && configuredBasePath !== "/" ? configuredBasePath : "/Clash-Manager/";
    return new URL(`${APK_RELEASE_PATH}/${path}`, `${origin}${basePath}`).href;
  } catch {
    return undefined;
  }
}

/**
 * Builds the absolute same-origin release URL for downloading a companion binary.
 *
 * @param filename - The target APK filename.
 * @returns Same-origin matching download URL, or undefined under non-browser environments.
 */
export function buildSameOriginApkDownloadUrl(filename: string): string | undefined {
  return buildSameOriginApkReleaseUrl(encodeURIComponent(filename));
}

/**
 * Verifies if an outbound link corresponds to a legitimate direct GitHub APK download.
 *
 * @param url - The target candidate URL.
 * @param filename - The expected file name segment.
 * @returns Verification success indicator.
 *
 * @remarks
 * [THREAT ANNOTATION]: Anti-Spoofing Guard. Enforces HTTPS and absolute raw.githubusercontent.com
 * host boundaries to prevent malicious phishing or open redirect exploits disguised as updates.
 */
export function isDirectApkDownloadUrl(url: string | null | undefined, filename: string): url is string {
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

/**
 * Extracts distinct numerical semantic version boundaries from standardized filenames.
 *
 * @param filename - The APK release filename to parse.
 * @returns Parsed segments mapping, or undefined if parsing failed.
 */
export function parseReleaseApkFilename(filename: string): ReleaseApkParts | undefined {
  const match = filename.match(/^clashmanager-v(\d+)\.(\d+)\.(\d+)\+(\d+)\.apk$/);
  if (!match) return undefined;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    build: Number(match[4]),
  };
}

/**
 * Compares two standard companion APK filenames to compute semantic precedence.
 *
 * @param firstApkFilename - The initial candidate filename.
 * @param secondApkFilename - The comparison target filename.
 * @returns Numeric comparison indicator following array sorting guidelines.
 *
 * @remarks
 * [DECISION LOG]: Evaluates segment-by-segment: major first, down through build numbers.
 * This guarantees proper chronological hierarchy independent of text character ordering.
 */
export function compareReleaseApkFilenames(firstApkFilename: string, secondApkFilename: string): number {
  const parsedFirstApk = parseReleaseApkFilename(firstApkFilename);
  const parsedSecondApk = parseReleaseApkFilename(secondApkFilename);
  if (!parsedFirstApk || !parsedSecondApk) return 0;

  return (
    parsedFirstApk.major - parsedSecondApk.major ||
    parsedFirstApk.minor - parsedSecondApk.minor ||
    parsedFirstApk.patch - parsedSecondApk.patch ||
    parsedFirstApk.build - parsedSecondApk.build
  );
}

/**
 * Selects the highest available version filename from a list of release contents.
 *
 * @param contents - Directory content metadata returned by the GitHub API.
 * @returns Newest file name or undefined if no matching files are present.
 */
export function selectNewestReleaseApkFilename(contents: GitHubReleaseContent[]): string | undefined {
  return selectNewestReleaseApk(contents)?.filename;
}

/**
 * Evaluates listed directory items to identify and return the newest release file block.
 *
 * @param contents - Collection of candidate files retrieved from source API.
 * @returns The structured newest APK model, or undefined if none matched format rules.
 *
 * @remarks
 * [DECISION LOG]: Performs flatMap format matching first to discard non-conforming items,
 * sorts version structures chronologically, and returns the highest matched element.
 */
export function selectNewestReleaseApk(contents: GitHubReleaseContent[]): ApkReleaseDownload | undefined {
  const filename = contents
    .flatMap((releaseContentEntry) => releaseContentEntry.type === "file" && isReleaseApkFilename(releaseContentEntry.name) ? [releaseContentEntry.name] : [])
    .sort(compareReleaseApkFilenames)
    .at(-1);

  if (!filename) return undefined;

  const matchingReleaseContent = contents.find((releaseContentEntry) => releaseContentEntry.name === filename);
  return {
    filename,
    url: isDirectApkDownloadUrl(matchingReleaseContent?.download_url, filename)
      ? matchingReleaseContent.download_url
      : buildApkDownloadUrl(filename),
  };
}

/**
 * Scores how complete a candidate's metadata is, for tie-breaking between sources
 * that agree on the same release version.
 *
 * @param candidate - The release candidate to score.
 * @returns 2 when both checksum and size are present, 1 when only one is, 0 otherwise.
 */
function getMetadataCompletenessScore(candidate: ApkReleaseDownload): number {
  return (isSha256Digest(candidate.sha256) ? 1 : 0) + (isReleaseSizeBytes(candidate.sizeBytes) ? 1 : 0);
}

/**
 * Reduces a collection of resolved download objects down to the semantic peak candidate.
 *
 * @param candidates - List of potential download targets.
 * @returns Highest version candidate or undefined.
 *
 * @remarks
 * [THREAT:] Multiple sources (same-origin, GitHub contents API, remote latest.json)
 * frequently agree on the same newest version. The GitHub contents API fallback never
 * carries a checksum or size (see `selectNewestReleaseApk`), so on a version tie this
 * must prefer whichever candidate has the more complete metadata - otherwise a
 * metadata-poor source occurring earlier in the candidate array wins by default and
 * the UI permanently reports "checksum unavailable"/"size unknown" even though a
 * fully-populated source resolved successfully in the same pass.
 */
export function selectNewestReleaseDownload(candidates: Array<ApkReleaseDownload | undefined>): ApkReleaseDownload | undefined {
  return candidates.reduce<ApkReleaseDownload | undefined>((newestRelease, candidate) => {
    if (!candidate) return newestRelease;
    if (!newestRelease) return candidate;

    const versionComparison = compareReleaseApkFilenames(candidate.filename, newestRelease.filename);
    if (versionComparison > 0) return candidate;
    if (versionComparison < 0) return newestRelease;

    return getMetadataCompletenessScore(candidate) > getMetadataCompletenessScore(newestRelease)
      ? candidate
      : newestRelease;
  }, undefined);
}
