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
export const APK_RELEASE_PATH = "APK/release";

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
   * The resolved newest companion filename.
   */
  filename: string;
  /**
   * The direct binary or fallback URL to fetch the APK.
   */
  url: string;
  /**
   * Unix epoch timestamp representing cache invalidation deadline.
   */
  expiresAt: number;
};

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
 * Resolved APK release metadata representing filename and matched secure download URL.
 */
export type ApkReleaseDownload = {
  /**
   * The verified APK filename.
   */
  filename: string;
  /**
   * The validated secure URL pointing to the file.
   */
  url: string;
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

/**
 * Extracts distinct numerical semantic version boundaries from standardized filenames.
 *
 * @param filename - The APK release filename to parse.
 * @returns Parsed segments mapping, or undefined if parsing failed.
 */
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
function compareReleaseApkFilenames(firstApkFilename: string, secondApkFilename: string): number {
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
 * Reduces a collection of resolved download objects down to the semantic peak candidate.
 *
 * @param candidates - List of potential download targets.
 * @returns Highest version candidate or undefined.
 */
function selectNewestReleaseDownload(candidates: Array<ApkReleaseDownload | undefined>): ApkReleaseDownload | undefined {
  return candidates.reduce<ApkReleaseDownload | undefined>((newestRelease, candidate) => {
    if (!candidate) return newestRelease;
    if (!newestRelease) return candidate;

    return compareReleaseApkFilenames(candidate.filename, newestRelease.filename) > 0
      ? candidate
      : newestRelease;
  }, undefined);
}

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
