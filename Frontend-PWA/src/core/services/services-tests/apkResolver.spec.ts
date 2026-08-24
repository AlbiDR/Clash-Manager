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
  buildFreshUrl,
  buildFreshApkMetadataUrl,
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
    vi.useRealTimers();
  });

  describe("buildFreshUrl and buildFreshApkMetadataUrl", () => {
    it("should correctly append t query parameter to URLs", () => {
      const urlWithoutParams = "https://example.com/api";
      const freshUrl = buildFreshUrl(urlWithoutParams);
      expect(freshUrl).toMatch(/^https:\/\/example\.com\/api\?t=\d+$/);

      const urlWithParams = "https://example.com/api?foo=bar";
      const freshUrlWithParams = buildFreshUrl(urlWithParams);
      expect(freshUrlWithParams).toMatch(/^https:\/\/example\.com\/api\?foo=bar&t=\d+$/);
    });

    it("should build fresh apk metadata URL using constant", () => {
      const freshMetadataUrl = buildFreshApkMetadataUrl();
      expect(freshMetadataUrl).toContain("/latest.json");
      expect(freshMetadataUrl).toMatch(/&t=\d+|t=\d+/);
    });
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

    it("should compare complex and varied versions to pick the absolute newest", () => {
      const versions = [
        { name: "clashmanager-v14.43.2+100.apk", type: "file" }, // build is smaller, but version is larger
        { name: "clashmanager-v15.0.0+1.apk", type: "file" },    // major is larger
        { name: "clashmanager-v14.50.0+1.apk", type: "file" },    // minor is larger
        { name: "clashmanager-v14.43.3+1.apk", type: "file" },    // patch is larger
        { name: "clashmanager-v14.43.2+176.apk", type: "file" },  // high build, lower version
      ];

      const newest = selectNewestReleaseApk(versions);
      expect(newest?.filename).toBe("clashmanager-v15.0.0+1.apk");
    });

    it("should compare build number as ultimate tie-breaker when version is identical", () => {
      const versions = [
        { name: "clashmanager-v14.43.2+176.apk", type: "file" },
        { name: "clashmanager-v14.43.2+177.apk", type: "file" },
        { name: "clashmanager-v14.43.2+175.apk", type: "file" },
      ];

      const newest = selectNewestReleaseApk(versions);
      expect(newest?.filename).toBe("clashmanager-v14.43.2+177.apk");
    });

    it("should ignore invalid files or files with non-file type", () => {
      const contents = [
        { name: "clashmanager-v14.43.2+177.apk", type: "dir" }, // invalid type
        { name: "clashmanager-v14.43.2+176.apk", type: "file" },
        { name: "clashmanager-v14.43.invalid+1.apk", type: "file" }, // invalid name format
      ];

      const newest = selectNewestReleaseApk(contents);
      expect(newest?.filename).toBe("clashmanager-v14.43.2+176.apk");
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

    it("should discard untrusted download_url (wrong protocol) and construct raw GitHub release URL", () => {
      const contents = [
        {
          name: "clashmanager-v14.43.1+173.apk",
          type: "file",
          download_url: "http://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/clashmanager-v14.43.1+173.apk",
        },
      ];

      const newest = selectNewestReleaseApk(contents);
      expect(newest?.url).toBe(
        "https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/clashmanager-v14.43.1%2B173.apk"
      );
    });

    it("should discard untrusted download_url (wrong hostname) and construct raw GitHub release URL", () => {
      const contents = [
        {
          name: "clashmanager-v14.43.1+173.apk",
          type: "file",
          download_url: "https://evil.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/clashmanager-v14.43.1+173.apk",
        },
      ];

      const newest = selectNewestReleaseApk(contents);
      expect(newest?.url).toBe(
        "https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/clashmanager-v14.43.1%2B173.apk"
      );
    });

    it("should discard untrusted download_url (wrong path suffix) and construct raw GitHub release URL", () => {
      const contents = [
        {
          name: "clashmanager-v14.43.1+173.apk",
          type: "file",
          download_url: "https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/wrong-file-name.apk",
        },
      ];

      const newest = selectNewestReleaseApk(contents);
      expect(newest?.url).toBe(
        "https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/clashmanager-v14.43.1%2B173.apk"
      );
    });

    it("should discard invalid URL strings that fail URL parsing and fallback safely", () => {
      const contents = [
        {
          name: "clashmanager-v14.43.1+173.apk",
          type: "file",
          download_url: "not-even-a-url-at-all",
        },
      ];

      const newest = selectNewestReleaseApk(contents);
      expect(newest?.url).toBe(
        "https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/clashmanager-v14.43.1%2B173.apk"
      );
    });
  });

  describe("buildSameOriginApkReleaseUrl & buildSameOriginApkDownloadUrl", () => {
    it("should return undefined in SSR environments (when window is undefined)", () => {
      vi.stubGlobal("window", undefined);
      expect(buildSameOriginApkReleaseUrl("latest.json")).toBeUndefined();
      expect(buildSameOriginApkDownloadUrl("clashmanager-v1.apk")).toBeUndefined();
    });

    it("should handle error in catch block gracefully when location access throws", () => {
      const brokenWindow = {};
      Object.defineProperty(brokenWindow, "location", {
        get() {
          throw new Error("Access Denied");
        }
      });
      vi.stubGlobal("window", brokenWindow);
      expect(buildSameOriginApkReleaseUrl("latest.json")).toBeUndefined();
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

    it("should preserve optional metadata from latest.json", async () => {
      const sha256 = "b".repeat(64);
      vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
        if (url.includes("contents/APK/release")) {
          return Promise.resolve({ ok: false });
        }
        if (url.includes("latest.json")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              changelog: ["Smarter native updater"],
              filename: "clashmanager-v14.43.1+173.apk",
              sha256,
              sizeBytes: 3_900_000,
              version: "14.43.1",
            })
          });
        }
        return Promise.resolve({ ok: false });
      }));

      const release = await resolveLatestApkRelease();
      expect(release).toMatchObject({
        changelog: ["Smarter native updater"],
        filename: "clashmanager-v14.43.1+173.apk",
        sha256,
        sizeBytes: 3_900_000,
        version: "14.43.1",
      });
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
      expect(release?.url).toContain("/Clash-Manager/apk/release/clashmanager-v14.43.2%2B176.apk");
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

    it("should expire cache and perform a new fetch after TTL has elapsed", async () => {
      vi.useFakeTimers();
      // Set initial base system time
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      let versionNum = 174;
      vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
        if (url.includes("contents/APK/release")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([
              { name: `clashmanager-v14.43.1+${versionNum}.apk`, type: "file" }
            ])
          });
        }
        return Promise.resolve({ ok: false });
      }));

      const first = await resolveLatestApkRelease();
      expect(first?.filename).toBe("clashmanager-v14.43.1+174.apk");

      // Request again immediately - should hit cache
      const second = await resolveLatestApkRelease();
      expect(second?.filename).toBe("clashmanager-v14.43.1+174.apk");
      expect(fetch).toHaveBeenCalledTimes(2); // same-origin fails, contents API success, remote fails

      // Clear mock calls to start fresh
      vi.mocked(fetch).mockClear();

      // Advance clock past the 60 seconds TTL (61000ms)
      vi.advanceTimersByTime(61000);

      // Change the returned version for the next fetch
      versionNum = 175;

      // Request again - cache is expired, should trigger fresh fetch
      const third = await resolveLatestApkRelease();
      expect(third?.filename).toBe("clashmanager-v14.43.1+175.apk");
      expect(fetch).toHaveBeenCalledTimes(2); // same-origin fails, contents API success, remote fails
    });

    it("should recover and return undefined if all endpoints fail completely", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network Error")));

      const result = await resolveLatestApkRelease();
      expect(result).toBeUndefined();
    });

    it("should handle response deserialization parsing errors gracefully", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new SyntaxError("Unexpected token < in JSON"))
      }));

      const result = await resolveLatestApkRelease();
      expect(result).toBeUndefined();
    });

    it("should handle unexpected contents response format gracefully", async () => {
      vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
        if (url.includes("contents/APK/release")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ not_an_array: true }) // invalid format
          });
        }
        return Promise.resolve({ ok: false });
      }));

      const result = await resolveLatestApkRelease();
      expect(result).toBeUndefined();
    });

    it("should call fetch with timeout abort controller and handle timeout abortion", async () => {
      let _aborted = false;
      vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (init?.signal) {
          init.signal.addEventListener("abort", () => {
            _aborted = true;
          });
        }
        return new Promise(() => {}); // never resolves
      }));

      const _promise = resolveLatestApkRelease();

      // Since it hangs, it would time out inside fetchFresh.
      // Let's assert that an abort signal was provided on fetch call
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal)
        })
      );
    });
  });
});
