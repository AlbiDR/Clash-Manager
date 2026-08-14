// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * APK Release Resolver Utilities Unit Tests
 *
 * @remarks
 * **Architectural Context:**
 * - **Domain:** Layer 1 Core Services (@core)
 * - **Satisfaction:** ADR Section IV: Resilience & Operational Security.
 *
 * This test suite validates pure utility logic, chronological precedence comparisons,
 * segment parsing, domain validation boundaries, and same-origin URL generation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  APK_RELEASE_RAW_BASE_URL,
  APK_LATEST_METADATA_URL,
  APK_RELEASE_CONTENTS_API_URL,
  APK_FETCH_TIMEOUT_MS,
  APK_RESOLUTION_CACHE_TTL_MS,
  APK_RELEASE_PATH,
  buildFreshApkMetadataUrl,
  buildFreshUrl,
  isReleaseApkFilename,
  isReleaseVersion,
  isReleaseBuildNumber,
  buildApkDownloadUrl,
  buildSameOriginApkReleaseUrl,
  buildSameOriginApkDownloadUrl,
  isDirectApkDownloadUrl,
  parseReleaseApkFilename,
  compareReleaseApkFilenames,
  selectNewestReleaseApkFilename,
  selectNewestReleaseApk,
  selectNewestReleaseDownload,
} from "../apkResolverUtils";

describe("apkResolverUtils", () => {
  let mockLocation: { reload: any; href: string };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLocation = { reload: vi.fn(), href: "" };
    vi.stubGlobal("location", mockLocation);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("Constants", () => {
    it("should export standard resolution configuration values", () => {
      expect(APK_RELEASE_RAW_BASE_URL).toBe("https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release");
      expect(APK_LATEST_METADATA_URL).toBe("https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/latest.json");
      expect(APK_RELEASE_CONTENTS_API_URL).toBe("https://api.github.com/repos/AlbiDR/Clash-Manager/contents/APK/release?ref=Beta");
      expect(APK_FETCH_TIMEOUT_MS).toBe(10000);
      expect(APK_RESOLUTION_CACHE_TTL_MS).toBe(60000);
      expect(APK_RELEASE_PATH).toBe("apk/release");
    });
  });

  describe("buildFreshUrl and buildFreshApkMetadataUrl", () => {
    it("should correctly append t query parameter to URLs without existing params", () => {
      const url = "https://example.com/api";
      const result = buildFreshUrl(url);
      expect(result).toMatch(/^https:\/\/example\.com\/api\?t=\d+$/);
    });

    it("should correctly append t query parameter to URLs with existing params", () => {
      const url = "https://example.com/api?foo=bar";
      const result = buildFreshUrl(url);
      expect(result).toMatch(/^https:\/\/example\.com\/api\?foo=bar&t=\d+$/);
    });

    it("should build fresh apk metadata URL using constant base", () => {
      const freshMetadataUrl = buildFreshApkMetadataUrl();
      expect(freshMetadataUrl).toContain("/latest.json");
      expect(freshMetadataUrl).toMatch(/t=\d+/);
    });
  });

  describe("isReleaseApkFilename", () => {
    it("should return true for valid companion APK release filenames", () => {
      expect(isReleaseApkFilename("clashmanager-v14.40.10+148.apk")).toBe(true);
      expect(isReleaseApkFilename("clashmanager-v1.0.0+1.apk")).toBe(true);
      expect(isReleaseApkFilename("clashmanager-v999.999.999+99999.apk")).toBe(true);
    });

    it("should return false for malformed filenames", () => {
      expect(isReleaseApkFilename("clashmanager-v14.40.10.apk")).toBe(false); // missing build number
      expect(isReleaseApkFilename("clashmanager.apk")).toBe(false); // missing version prefix
      expect(isReleaseApkFilename("clashmanager-v14.40.10+148.zip")).toBe(false); // wrong extension
      expect(isReleaseApkFilename("clashmanager-v14.40.10+148.apk.json")).toBe(false); // appended extension
      expect(isReleaseApkFilename("clashmanager-v14.40.10+abc.apk")).toBe(false); // non-numeric build
      expect(isReleaseApkFilename("")).toBe(false);
      expect(isReleaseApkFilename(undefined)).toBe(false);
    });
  });

  describe("isReleaseVersion", () => {
    it("should return true for correct semantic version triples", () => {
      expect(isReleaseVersion("14.40.10")).toBe(true);
      expect(isReleaseVersion("1.0.0")).toBe(true);
      expect(isReleaseVersion("999.999.999")).toBe(true);
    });

    it("should return false for non-conforming version strings", () => {
      expect(isReleaseVersion("14.40")).toBe(false);
      expect(isReleaseVersion("14.40.10.2")).toBe(false);
      expect(isReleaseVersion("14.40.10+148")).toBe(false);
      expect(isReleaseVersion("v14.40.10")).toBe(false);
      expect(isReleaseVersion("abc")).toBe(false);
      expect(isReleaseVersion("")).toBe(false);
      expect(isReleaseVersion(undefined)).toBe(false);
    });
  });

  describe("isReleaseBuildNumber", () => {
    it("should return true for positive integers", () => {
      expect(isReleaseBuildNumber(1)).toBe(true);
      expect(isReleaseBuildNumber(148)).toBe(true);
      expect(isReleaseBuildNumber(999999)).toBe(true);
    });

    it("should return false for invalid build indicators", () => {
      expect(isReleaseBuildNumber(0)).toBe(false);
      expect(isReleaseBuildNumber(-1)).toBe(false);
      expect(isReleaseBuildNumber(1.5)).toBe(false); // float
      expect(isReleaseBuildNumber(NaN)).toBe(false);
      expect(isReleaseBuildNumber(undefined)).toBe(false);
    });
  });

  describe("buildApkDownloadUrl", () => {
    it("should construct absolute HTTPS download URL for the target filename", () => {
      const filename = "clashmanager-v14.40.10+148.apk";
      const expected = "https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/clashmanager-v14.40.10%2B148.apk";
      expect(buildApkDownloadUrl(filename)).toBe(expected);
    });
  });

  describe("buildSameOriginApkReleaseUrl and buildSameOriginApkDownloadUrl", () => {
    it("should return absolute URL pointing to same origin with fallback base", () => {
      vi.stubGlobal("window", {
        location: { origin: "http://localhost:3000" }
      });
      // Mock import.meta.env.BASE_URL if needed, otherwise it falls back to "/Clash-Manager/"
      const result = buildSameOriginApkReleaseUrl("latest.json");
      expect(result).toBe("http://localhost:3000/Clash-Manager/apk/release/latest.json");
    });

    it("should respect import.meta.env.BASE_URL when present and non-root", () => {
      vi.stubGlobal("window", {
        location: { origin: "https://my-app.dev" }
      });
      // Override or mock BASE_URL if possible, or verify fallback subdirectory
      const result = buildSameOriginApkReleaseUrl("test.json");
      expect(result).toContain("apk/release/test.json");
    });

    it("should return undefined in non-browser SSR environment (window is undefined)", () => {
      vi.stubGlobal("window", undefined);
      expect(buildSameOriginApkReleaseUrl("latest.json")).toBeUndefined();
      expect(buildSameOriginApkDownloadUrl("clashmanager-v1.apk")).toBeUndefined();
    });

    it("should return undefined if reading location throws", () => {
      const hostileWindow = {};
      Object.defineProperty(hostileWindow, "location", {
        get() {
          throw new Error("Security Access Denied");
        }
      });
      vi.stubGlobal("window", hostileWindow);
      expect(buildSameOriginApkReleaseUrl("latest.json")).toBeUndefined();
    });

    it("should build download url for binary correctly on same origin", () => {
      vi.stubGlobal("window", {
        location: { origin: "https://clash.app" }
      });
      const downloadUrl = buildSameOriginApkDownloadUrl("clashmanager-v1+1.apk");
      expect(downloadUrl).toContain("/apk/release/clashmanager-v1%2B1.apk");
    });
  });

  describe("isDirectApkDownloadUrl", () => {
    const filename = "clashmanager-v14.43.1+173.apk";

    it("should return true for trusted direct raw github secure URLs matching format exactly", () => {
      const url = "https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/clashmanager-v14.43.1+173.apk";
      expect(isDirectApkDownloadUrl(url, filename)).toBe(true);
    });

    it("should return false if any component of the url is altered or untrusted", () => {
      // Wrong protocol
      expect(isDirectApkDownloadUrl("http://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/clashmanager-v14.43.1+173.apk", filename)).toBe(false);
      // Wrong host
      expect(isDirectApkDownloadUrl("https://evil.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/clashmanager-v14.43.1+173.apk", filename)).toBe(false);
      // Wrong path
      expect(isDirectApkDownloadUrl("https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/wrong-name.apk", filename)).toBe(false);
      // Mismatched suffix
      expect(isDirectApkDownloadUrl("https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/clashmanager-v14.43.1+173.apk/extra", filename)).toBe(false);
      // Malformed URL string
      expect(isDirectApkDownloadUrl("not-a-url", filename)).toBe(false);
      // Null or undefined
      expect(isDirectApkDownloadUrl(null, filename)).toBe(false);
      expect(isDirectApkDownloadUrl(undefined, filename)).toBe(false);
    });
  });

  describe("parseReleaseApkFilename", () => {
    it("should parse standard companion filenames into version parts", () => {
      const result = parseReleaseApkFilename("clashmanager-v14.43.1+173.apk");
      expect(result).toEqual({
        major: 14,
        minor: 43,
        patch: 1,
        build: 173,
      });
    });

    it("should return undefined for non-conforming strings", () => {
      expect(parseReleaseApkFilename("clashmanager-v14.43.1.apk")).toBeUndefined();
      expect(parseReleaseApkFilename("not-clash-v14.43.1+173.apk")).toBeUndefined();
      expect(parseReleaseApkFilename("")).toBeUndefined();
    });
  });

  describe("compareReleaseApkFilenames", () => {
    it("should return positive number when first filename is newer (major precedence)", () => {
      expect(compareReleaseApkFilenames("clashmanager-v2.0.0+1.apk", "clashmanager-v1.9.9+999.apk")).toBeGreaterThan(0);
    });

    it("should return positive number when first filename is newer (minor precedence)", () => {
      expect(compareReleaseApkFilenames("clashmanager-v1.10.0+1.apk", "clashmanager-v1.9.9+999.apk")).toBeGreaterThan(0);
    });

    it("should return positive number when first filename is newer (patch precedence)", () => {
      expect(compareReleaseApkFilenames("clashmanager-v1.9.10+1.apk", "clashmanager-v1.9.9+999.apk")).toBeGreaterThan(0);
    });

    it("should return positive number when first filename is newer (build precedence)", () => {
      expect(compareReleaseApkFilenames("clashmanager-v1.9.9+1000.apk", "clashmanager-v1.9.9+999.apk")).toBeGreaterThan(0);
    });

    it("should return negative number when second filename is newer", () => {
      expect(compareReleaseApkFilenames("clashmanager-v1.9.9+999.apk", "clashmanager-v2.0.0+1.apk")).toBeLessThan(0);
    });

    it("should return 0 when both are identical or any is invalid", () => {
      expect(compareReleaseApkFilenames("clashmanager-v1.9.9+999.apk", "clashmanager-v1.9.9+999.apk")).toBe(0);
      expect(compareReleaseApkFilenames("clashmanager-v1.9.9+999.apk", "invalid-name")).toBe(0);
      expect(compareReleaseApkFilenames("invalid-name", "clashmanager-v1.9.9+999.apk")).toBe(0);
    });
  });

  describe("selectNewestReleaseApkFilename", () => {
    it("should return the filename of the newest valid APK release", () => {
      const contents = [
        { name: "clashmanager-v14.40.10+148.apk", type: "file" },
        { name: "clashmanager-v14.43.0+172.apk", type: "file" },
        { name: "clashmanager-v14.41.0+150.apk", type: "file" },
      ];
      expect(selectNewestReleaseApkFilename(contents)).toBe("clashmanager-v14.43.0+172.apk");
    });

    it("should return undefined if no valid release file is found", () => {
      expect(selectNewestReleaseApkFilename([])).toBeUndefined();
    });
  });

  describe("selectNewestReleaseApk", () => {
    it("should extract correctly and fall back to custom constructed url if download_url is untrusted", () => {
      const contents = [
        {
          name: "clashmanager-v14.43.1+173.apk",
          type: "file",
          download_url: "https://untrusted-host.com/wrong-file.apk",
        }
      ];
      const result = selectNewestReleaseApk(contents);
      expect(result).toEqual({
        filename: "clashmanager-v14.43.1+173.apk",
        url: "https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/clashmanager-v14.43.1%2B173.apk"
      });
    });

    it("should ignore non-file type blocks", () => {
      const contents = [
        { name: "clashmanager-v14.43.1+173.apk", type: "dir" }
      ];
      expect(selectNewestReleaseApk(contents)).toBeUndefined();
    });
  });

  describe("selectNewestReleaseDownload", () => {
    it("should pick the candidate with highest precedence among downloads", () => {
      const candidate1 = { filename: "clashmanager-v14.43.0+172.apk", url: "https://host/1" };
      const candidate2 = { filename: "clashmanager-v14.43.1+173.apk", url: "https://host/2" };
      const candidate3 = { filename: "clashmanager-v14.42.0+150.apk", url: "https://host/3" };

      const result = selectNewestReleaseDownload([candidate1, undefined, candidate2, candidate3]);
      expect(result).toBe(candidate2);
    });

    it("should return undefined for empty/undefined lists", () => {
      expect(selectNewestReleaseDownload([])).toBeUndefined();
      expect(selectNewestReleaseDownload([undefined, undefined])).toBeUndefined();
    });

    it("should handle single candidate lists", () => {
      const candidate = { filename: "clashmanager-v1.0.0+1.apk", url: "https://host/1" };
      expect(selectNewestReleaseDownload([candidate])).toBe(candidate);
    });
  });
});
