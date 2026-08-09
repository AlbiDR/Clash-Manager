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
 */

export const APK_RELEASE_RAW_BASE_URL = "https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release";
export const APK_LATEST_METADATA_URL = `${APK_RELEASE_RAW_BASE_URL}/latest.json`;
export const APK_RELEASE_CONTENTS_API_URL =
  "https://api.github.com/repos/AlbiDR/Clash-Manager/contents/APK/release?ref=Beta";
export const APK_FETCH_TIMEOUT_MS = 10000;
export const APK_RESOLUTION_CACHE_TTL_MS = 60000;
export const APK_RELEASE_PATH = "APK/release";

export type GitHubReleaseContent = {
  download_url?: string | null;
  name?: string;
  type?: string;
};

export type ReleaseApkParts = {
  major: number;
  minor: number;
  patch: number;
  build: number;
};

export type ApkResolutionCache = {
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
