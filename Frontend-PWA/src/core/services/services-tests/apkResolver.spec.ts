// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * APK Release Resolver Service Unit Tests
 *
 * @remarks
 * **Architectural Context:**
 * - **Domain:** Layer 1 Core Services (@core)
 * - **Satisfaction:** ADR Section IV: Resilience & Operational Security.
 *
 * This test suite validates low-level dynamic APK filename resolution, caching mechanics,
 * contents API parsing, direct download URLs, newest version comparisons, and same-origin resolving.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  resolveLatestApkFilename,
  resolveLatestApkRelease,
  resetApkResolutionCacheForTests,
  isReleaseApkFilename,
  selectNewestReleaseApk,
  buildSameOriginApkReleaseUrl,
  buildSameOriginApkDownloadUrl,
} from "../apkResolver";

describe("apkResolver", () => {
  const originalFetch = globalThis.fetch;
  let mockLocation: { reload: any; href: string };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLocation = { reload: vi.fn(), href: "" };
    vi.stubGlobal("location", mockLocation);
    resetApkResolutionCacheForTests();

    // Default dynamic routing fetch mock
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("contents/APK/release")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { name: "clashmanager-v14.43.0+172.apk", type: "file" }
          ])
        });
      }
      if (url.includes("latest.json")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ filename: "clashmanager-v14.43.1+173.apk" })
        });
      }
      return Promise.resolve({ ok: false });
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
  });

  describe("isReleaseApkFilename", () => {
    it("should correctly identify valid and invalid APK release filenames", () => {
      expect(isReleaseApkFilename("clashmanager-v14.40.10+148.apk")).toBe(true);
      expect(isReleaseApkFilename("clashmanager-v1.0.0+1.apk")).toBe(true);
      expect(isReleaseApkFilename("clashmanager-v14.40.10.apk")).toBe(false);
      expect(isReleaseApkFilename("clashmanager.apk")).toBe(false);
      expect(isReleaseApkFilename(undefined)).toBe(false);
    });
  });

  describe("selectNewestReleaseApk", () => {
    it("should return the newest release and correct URL from contents listing", () => {
      const contents = [
        { name: "clashmanager-v14.40.10+148.apk", type: "file" },
        { name: "clashmanager-v14.43.0+172.apk", type: "file" },
        { name: "clashmanager-v14.41.0+150.apk", type: "file" },
        { name: "not-an-apk.txt", type: "file" },
      ];

      const newest = selectNewestReleaseApk(contents);
      expect(newest).toEqual({
        filename: "clashmanager-v14.43.0+172.apk",
        url: "https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/clashmanager-v14.43.0%2B172.apk",
      });
    });

    it("should return undefined if no valid release APKs are found", () => {
      const contents = [
        { name: "not-an-apk.txt", type: "file" },
      ];
      expect(selectNewestReleaseApk(contents)).toBeUndefined();
    });

    it("should preserve trusted download_url if it matches raw.githubusercontent.com standard", () => {
      const contents = [
        {
          name: "clashmanager-v14.43.1+173.apk",
          type: "file",
          download_url: "https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/clashmanager-v14.43.1+173.apk",
        },
      ];

      const newest = selectNewestReleaseApk(contents);
      expect(newest).toEqual({
        filename: "clashmanager-v14.43.1+173.apk",
        url: "https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/clashmanager-v14.43.1+173.apk",
      });
    });

    it("should discard untrusted download_url and construct raw GitHub release URL", () => {
      const contents = [
        {
          name: "clashmanager-v14.43.1+173.apk",
          type: "file",
          download_url: "https://example.com/not-the-apk.apk",
        },
      ];

      const newest = selectNewestReleaseApk(contents);
      expect(newest?.url).toBe(
        "https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/clashmanager-v14.43.1%2B173.apk"
      );
    });
  });

  describe("resolveLatestApkRelease / resolveLatestApkFilename", () => {
    it("should fetch newest from GitHub contents API", async () => {
      const filename = await resolveLatestApkFilename();
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(
          /^https:\/\/api\.github\.com\/repos\/AlbiDR\/Clash-Manager\/contents\/APK\/release\?ref=Beta&t=\d+$/,
        ),
        expect.objectContaining({
          cache: "no-store",
          headers: expect.any(Headers),
          signal: expect.any(AbortSignal),
        }),
      );
      expect(filename).toBe("clashmanager-v14.43.1+173.apk");
    });

    it("should fall back to latest.json when GitHub contents API is unavailable", async () => {
      vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
        if (url.includes("contents/APK/release")) {
          return Promise.resolve({ ok: false });
        }
        if (url.includes("latest.json")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ filename: "clashmanager-v14.43.1+173.apk" })
          });
        }
        return Promise.resolve({ ok: false });
      }));

      const filename = await resolveLatestApkFilename();
      expect(filename).toBe("clashmanager-v14.43.1+173.apk");
    });

    it("should resolve same-origin latest.json when configured", async () => {
      mockLocation.href = "http://localhost:3000/Clash-Manager/";

      vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
        if (url.includes("localhost:3000") && url.includes("latest.json")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ filename: "clashmanager-v14.43.2+176.apk" })
          });
        }
        return Promise.resolve({ ok: false });
      }));

      const release = await resolveLatestApkRelease();
      expect(release?.url).toContain("/Clash-Manager/APK/release/clashmanager-v14.43.2%2B176.apk");
      expect(release?.filename).toBe("clashmanager-v14.43.2+176.apk");
    });

    it("should reuse cached response instead of refetching within TTL", async () => {
      const first = await resolveLatestApkFilename();
      const second = await resolveLatestApkFilename();

      expect(fetch).toHaveBeenCalledTimes(2); // same origin fails, contents + latest fetch succeeded
      expect(first).toBe("clashmanager-v14.43.1+173.apk");
      expect(second).toBe("clashmanager-v14.43.1+173.apk");
    });

    it("should share one in-flight request across concurrent callers", async () => {
      let resolveMetadata!: (response: any) => void;
      const metadataResponse = new Promise((resolve) => {
        resolveMetadata = resolve;
      });

      vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
        if (url.includes("contents/APK/release")) {
          return metadataResponse;
        }
        return Promise.resolve({ ok: false });
      }));

      const first = resolveLatestApkRelease();
      const second = resolveLatestApkRelease();

      resolveMetadata({
        ok: true,
        json: () => Promise.resolve([{ name: "clashmanager-v14.43.0+172.apk", type: "file" }])
      });

      const results = await Promise.all([first, second]);
      expect(results[0]?.filename).toBe("clashmanager-v14.43.0+172.apk");
      expect(results[1]?.filename).toBe("clashmanager-v14.43.0+172.apk");
    });
  });
});
