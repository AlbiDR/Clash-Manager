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
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useApkManager } from "../useApkManager";
import * as apkResolver from "../apkResolver";
import { useNativeBridge } from "../useNativeBridge";

const mockToast = {
  info: vi.fn(() => 1),
  success: vi.fn(),
  error: vi.fn(),
  remove: vi.fn(),
};

vi.mock("../useToast", () => ({
  useToast: () => mockToast,
}));

vi.mock("../useNativeBridge", () => ({
  useNativeBridge: vi.fn(),
}));

describe("useApkManager", () => {
  const mockBridge = {
    getAppVersionName: vi.fn(),
    getAppVersionCode: vi.fn(),
    getBuildNumber: vi.fn(),
    canRequestPackageInstalls: vi.fn(),
    downloadApkFile: vi.fn(),
    openExternalUrl: vi.fn(),
    openPackageInstallSettings: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks clears calls but NOT implementations, so a mockReturnValue
    // set by one test leaks into every test after it. These bridge getters are
    // read by the update-comparison path, so a leaked value silently changes
    // what a later test is actually exercising.
    mockBridge.getAppVersionName.mockReset();
    mockBridge.getAppVersionCode.mockReset();
    mockBridge.getBuildNumber.mockReset();
    vi.mocked(useNativeBridge).mockReturnValue({
      bridge: { value: mockBridge as any },
    } as any);
  });

  it("initializes with default state", () => {
    const { apkUpdateState, apkUpdateMessage, installedApkLabel } = useApkManager();
    expect(apkUpdateState.value).toBe("idle");
    expect(apkUpdateMessage.value).toBe("APK status not checked");
    expect(installedApkLabel.value).toBe("Web/PWA session");
  });

  it("detects when published release is unavailable", async () => {
    vi.spyOn(apkResolver, "resolveLatestApkRelease").mockResolvedValue(undefined);
    const { checkApkUpdate, apkUpdateState, apkUpdateMessage } = useApkManager();

    await checkApkUpdate();

    expect(apkUpdateState.value).toBe("error");
    expect(apkUpdateMessage.value).toBe("Published APK metadata unavailable");
  });

  it("identifies installed release as current when version matches", async () => {
    mockBridge.getAppVersionName.mockReturnValue("14.45.21");
    mockBridge.getBuildNumber.mockReturnValue(210);

    vi.spyOn(apkResolver, "resolveLatestApkRelease").mockResolvedValue({
      filename: "clashmanager-v14.45.21+210.apk",
      version: "14.45.21",
      buildNumber: 210,
      url: "https://example.com/apk",
      sizeBytes: 1024 * 1024 * 5,
    });

    const { checkApkUpdate, apkUpdateState, apkUpdateMessage } = useApkManager();

    await checkApkUpdate();

    expect(apkUpdateState.value).toBe("current");
    expect(apkUpdateMessage.value).toBe("Installed APK is current");
  });

  it("detects when an update is available", async () => {
    mockBridge.getAppVersionName.mockReturnValue("14.45.20");
    mockBridge.getBuildNumber.mockReturnValue(200);
    mockBridge.canRequestPackageInstalls.mockReturnValue(true);

    vi.spyOn(apkResolver, "resolveLatestApkRelease").mockResolvedValue({
      filename: "clashmanager-v14.45.21+210.apk",
      version: "14.45.21",
      buildNumber: 210,
      url: "https://example.com/apk",
      sizeBytes: 1024 * 1024 * 5,
    });

    const { checkApkUpdate, apkUpdateState, apkUpdateMessage } = useApkManager();

    await checkApkUpdate();

    expect(apkUpdateState.value).toBe("available");
    expect(apkUpdateMessage.value).toContain("APK update ready");
  });

  it("offers a minor-bump update even when the installed versionCode outranks the derived one", async () => {
    // Regression guard for the 2026-08-27 versionCode defect. The old code
    // derived a numeric version code from the release filename with
    // `major * 1000 + minor * 100 + patch * 10` and compared it against the
    // installed APK's REAL versionCode, short-circuiting before the semantic
    // version comparison.
    //
    // Installed 14.46.23 carries real versionCode 18830. The published 14.47.0
    // derived to 18700 under that formula, so 18830 - 18700 came out positive,
    // the app concluded it was already newer than the release, and every user
    // would have been stranded on 14.46.23 forever with no error anywhere.
    //
    // The semantic versions are compared directly now, so the installed
    // versionCode cannot outrank them however it was derived.
    mockBridge.getAppVersionName.mockReturnValue("14.46.23");
    mockBridge.getAppVersionCode.mockReturnValue(18830);
    mockBridge.getBuildNumber.mockReturnValue(245);
    mockBridge.canRequestPackageInstalls.mockReturnValue(true);

    vi.spyOn(apkResolver, "resolveLatestApkRelease").mockResolvedValue({
      filename: "clashmanager-v14.47.0+246.apk",
      version: "14.47.0",
      buildNumber: 246,
      url: "https://example.com/apk",
      sizeBytes: 1024 * 1024 * 5,
    });

    const { checkApkUpdate, apkUpdateState } = useApkManager();

    await checkApkUpdate();

    expect(apkUpdateState.value).toBe("available");
  });

  it("still reports current when the installed version equals the published one", async () => {
    // The companion to the case above: removing the versionCode comparison must
    // not make a genuinely up-to-date install look stale.
    mockBridge.getAppVersionName.mockReturnValue("14.47.0");
    mockBridge.getAppVersionCode.mockReturnValue(14047000);
    mockBridge.getBuildNumber.mockReturnValue(246);

    vi.spyOn(apkResolver, "resolveLatestApkRelease").mockResolvedValue({
      filename: "clashmanager-v14.47.0+246.apk",
      version: "14.47.0",
      buildNumber: 246,
      url: "https://example.com/apk",
      sizeBytes: 1024 * 1024 * 5,
    });

    const { checkApkUpdate, apkUpdateState } = useApkManager();

    await checkApkUpdate();

    expect(apkUpdateState.value).toBe("current");
  });

  it("flags release metadata mismatch when published version is older than installed", async () => {
    mockBridge.getAppVersionName.mockReturnValue("14.46.5");
    mockBridge.getBuildNumber.mockReturnValue(226);

    vi.spyOn(apkResolver, "resolveLatestApkRelease").mockResolvedValue({
      filename: "clashmanager-v14.45.19+213.apk",
      version: "14.45.19",
      buildNumber: 213,
      url: "https://example.com/old-apk",
      sizeBytes: 1024 * 1024 * 5,
    });

    const { checkApkUpdate, apkUpdateState, apkUpdateMessage } = useApkManager();

    await checkApkUpdate();

    expect(apkUpdateState.value).toBe("mismatch");
    expect(apkUpdateMessage.value).toBe("Release metadata mismatch");
  });

  it("flags blocked state when package install permission is missing", async () => {
    mockBridge.getAppVersionName.mockReturnValue("14.45.20");
    mockBridge.getBuildNumber.mockReturnValue(200);
    mockBridge.canRequestPackageInstalls.mockReturnValue(false);

    vi.spyOn(apkResolver, "resolveLatestApkRelease").mockResolvedValue({
      filename: "clashmanager-v14.45.21+210.apk",
      version: "14.45.21",
      buildNumber: 210,
      url: "https://example.com/apk",
      sizeBytes: 1024 * 1024 * 5,
    });

    const { checkApkUpdate, apkUpdateState, apkUpdateMessage } = useApkManager();

    await checkApkUpdate();

    expect(apkUpdateState.value).toBe("blocked");
    expect(apkUpdateMessage.value).toBe("Android install approval required");
  });

  it("handles errors during apk check gracefully", async () => {
    vi.spyOn(apkResolver, "resolveLatestApkRelease").mockRejectedValue(new Error("Network failed"));

    const { checkApkUpdate, apkUpdateState, apkUpdateMessage } = useApkManager();

    await checkApkUpdate();

    expect(apkUpdateState.value).toBe("error");
    expect(apkUpdateMessage.value).toBe("Published APK metadata unavailable");
  });

  it("formats computed labels and properties correctly", async () => {
    mockBridge.getAppVersionName.mockReturnValue("14.46.5");
    mockBridge.getBuildNumber.mockReturnValue(226);

    vi.spyOn(apkResolver, "resolveLatestApkRelease").mockResolvedValue({
      filename: "clashmanager-v14.46.5+226.apk",
      version: "14.46.5",
      buildNumber: 226,
      url: "https://example.com/apk",
      sizeBytes: 15 * 1024 * 1024,
      sha256: "abcdef1234567890abcdef1234567890",
      sourceName: "GitHub Releases",
      sourceUrl: "https://github.com/releases",
      changelog: ["Bug fixes", "Performance improvements"],
    });

    const {
      checkApkUpdate,
      installedApkLabel,
      latestApkLabel,
      apkDirectDownloadUrl,
      apkArtifactLabel,
      apkFeedSourceLabel,
      apkChangelog,
    } = useApkManager();

    await checkApkUpdate();

    expect(installedApkLabel.value).toBe("v14.46.5 (build 226)");
    expect(latestApkLabel.value).toBe("v14.46.5 (226)");
    expect(apkDirectDownloadUrl.value).toBe(""); // Same version = no direct download URL
    expect(apkArtifactLabel.value).toBe("15.0 MB · SHA-256 abcdef12...");
    expect(apkFeedSourceLabel.value).toBe("GitHub Releases: https://github.com/releases");
    expect(apkChangelog.value).toEqual(["Bug fixes", "Performance improvements"]);
  });

  describe("downloadApk", () => {
    it("handles download when release metadata is unavailable", async () => {
      vi.spyOn(apkResolver, "resolveLatestApkRelease").mockResolvedValue(undefined);
      const { downloadApk, apkUpdateState, apkUpdateMessage } = useApkManager();

      await downloadApk();

      expect(apkUpdateState.value).toBe("error");
      expect(apkUpdateMessage.value).toBe("Published APK metadata unavailable");
      expect(mockToast.error).toHaveBeenCalledWith("Could not find latest APK");
    });

    it("triggers native download manager when build number threshold is met", async () => {
      mockBridge.getAppVersionName.mockReturnValue("14.45.20");
      mockBridge.getBuildNumber.mockReturnValue(195);
      mockBridge.canRequestPackageInstalls.mockReturnValue(true);
      mockBridge.downloadApkFile.mockReturnValue(true);

      const release = {
        filename: "clashmanager-v14.45.21+214.apk",
        version: "14.45.21",
        buildNumber: 214,
        url: "https://example.com/apk",
        sizeBytes: 1024 * 1024 * 10,
        sha256: "1234567890",
      };
      vi.spyOn(apkResolver, "resolveLatestApkRelease").mockResolvedValue(release);

      const { downloadApk } = useApkManager();
      await downloadApk();

      expect(mockBridge.downloadApkFile).toHaveBeenCalledWith(release.url, release.filename, release.sha256);
      expect(mockToast.success).toHaveBeenCalledWith("APK download started");
    });

    it("falls back to external browser when native bridge lacks canRequestPackageInstalls", async () => {
      const legacyBridge = {
        getAppVersionName: vi.fn().mockReturnValue("14.45.20"),
        getBuildNumber: vi.fn().mockReturnValue(180),
        openExternalUrl: vi.fn(),
      };
      vi.mocked(useNativeBridge).mockReturnValue({
        bridge: { value: legacyBridge as any },
      } as any);

      const release = {
        filename: "clashmanager-v14.45.21+210.apk",
        version: "14.45.21",
        buildNumber: 210,
        url: "https://example.com/apk",
      };
      vi.spyOn(apkResolver, "resolveLatestApkRelease").mockResolvedValue(release);

      const { downloadApk } = useApkManager();
      await downloadApk();

      expect(legacyBridge.openExternalUrl).toHaveBeenCalledWith(release.url);
      expect(mockToast.info).toHaveBeenCalledWith("Install the APK from your browser to unlock native updater permissions");
    });
  });
});
