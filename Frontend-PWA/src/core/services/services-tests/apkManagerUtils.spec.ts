// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment node
 *
 * No DOM in this file, so it skips jsdom entirely. Building a jsdom Window
 * costs ~410ms per test file and dominated the suite (80.6s of ~120s CPU,
 * against 8.1s of actual test execution). Adding anything here that touches
 * `document`, `window`, `localStorage` or mounts a component will fail loudly
 * and immediately - remove this docblock if that is intentional.
 */
import { describe, expect, it } from "vitest";
import {
  compareReleaseVersions,
  formatApkArtifactLabel,
  formatApkFeedSourceLabel,
  formatInstalledApkLabel,
  getInstalledReleaseComparison,
  getReleaseVersionLabel,
  isInstalledApkCurrent,
  isPublishedApkOlderThanInstalled,
} from "../apkManagerUtils";
import type { ApkReleaseDownload } from "../apkResolver";

describe("apkManagerUtils", () => {
  describe("compareReleaseVersions", () => {
    it("compares semantic versions correctly", () => {
      expect(compareReleaseVersions("14.46.2", "14.46.1")).toBeGreaterThan(0);
      expect(compareReleaseVersions("14.46.1", "14.46.2")).toBeLessThan(0);
      expect(compareReleaseVersions("14.46.2", "14.46.2")).toBe(0);
      expect(compareReleaseVersions("15.0.0", "14.99.99")).toBeGreaterThan(0);
    });
  });

  describe("getInstalledReleaseComparison & guards", () => {
    const release: ApkReleaseDownload = {
      filename: "clashmanager-v14.46.2+191.apk",
      url: "https://example.com/apk",
      version: "14.46.2",
      buildNumber: 191,
    };

    it("evaluates installed vs published release comparison", () => {
      expect(getInstalledReleaseComparison("14.46.3", 192, release)).toBeGreaterThan(0);
      expect(getInstalledReleaseComparison("14.46.1", 190, release)).toBeLessThan(0);
      expect(getInstalledReleaseComparison("14.46.2", 191, release)).toBe(0);
    });

    it("correctly identifies current installed APK", () => {
      expect(isInstalledApkCurrent("14.46.2", 191, release)).toBe(true);
      expect(isInstalledApkCurrent("14.46.3", 192, release)).toBe(true);
      expect(isInstalledApkCurrent("14.46.1", 190, release)).toBe(false);
    });

    it("correctly identifies when published release is older than installed", () => {
      expect(isPublishedApkOlderThanInstalled("14.46.3", 192, release)).toBe(true);
      expect(isPublishedApkOlderThanInstalled("14.46.2", 191, release)).toBe(false);
    });
  });

  describe("label formatting", () => {
    it("formats release version label", () => {
      const release: ApkReleaseDownload = {
        filename: "clashmanager-v14.46.2+191.apk",
        url: "https://example.com/apk",
        version: "14.46.2",
        buildNumber: 191,
      };
      expect(getReleaseVersionLabel(release)).toBe("v14.46.2 (191)");
      expect(getReleaseVersionLabel(undefined)).toBe("Not checked");
    });

    it("formats installed APK label", () => {
      expect(formatInstalledApkLabel("14.46.2", 191, 191)).toBe("v14.46.2 (build 191)");
      expect(formatInstalledApkLabel(undefined, undefined, undefined)).toBe("Web/PWA session");
    });

    it("formats artifact and feed source labels", () => {
      const release: ApkReleaseDownload = {
        filename: "clashmanager-v14.46.2+191.apk",
        url: "https://example.com/apk",
        sha256: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        sizeBytes: 10485760,
        sourceName: "GitHub contents API",
        sourceUrl: "https://api.github.com/...",
      };
      expect(formatApkArtifactLabel(release)).toContain("10.0 MB");
      expect(formatApkArtifactLabel(release)).toContain("SHA-256 abcdef12");
      expect(formatApkFeedSourceLabel(release)).toBe("GitHub contents API: https://api.github.com/...");
    });
  });
});
