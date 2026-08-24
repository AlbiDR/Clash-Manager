// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * PWA Manager Service Unit Tests
 *
 * @remarks
 * **Architectural Context:**
 * - **Domain:** Layer 1 Core Services (@core)
 * - **Satisfaction:** ADR Section IV: Resilience & Operational Security.
 *
 * This test suite validates stable latest APK download dispatch, DownloadManager
 * bridge routing, and recovery protocols (cache purge and factory resets).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  resolveLatestApkFilename,
  resetApkResolutionCacheForTests,
  resetPwaInstallPromptForTests,
  usePwaManager,
} from "../usePwaManager";
import { idb } from "../StorageService";

const mockHaptics = {
  medium: vi.fn(),
  heavy: vi.fn(),
};

const mockToast = {
  info: vi.fn(() => "toast-id"),
  success: vi.fn(),
  error: vi.fn(),
  remove: vi.fn(),
};

const mockNativeBridge = {
  value: undefined as any,
};

vi.mock("@shared/composables/useHaptics", () => ({
  useHaptics: vi.fn(() => mockHaptics),
}));

vi.mock("../useToast", () => ({
  useToast: vi.fn(() => mockToast),
}));

const mockConfirm = vi.fn();

vi.mock("../useConfirm", () => ({
  useConfirm: vi.fn(() => ({
    active: { value: null },
    resolve: vi.fn(),
    confirm: mockConfirm,
  })),
}));

vi.mock("../useNativeBridge", () => ({
  useNativeBridge: vi.fn(() => ({
    bridge: mockNativeBridge,
  })),
}));

vi.mock("../StorageService", () => ({
  idb: {
    destroyAll: vi.fn(),
    clear: vi.fn(),
  },
}));

describe("usePwaManager", () => {
  const mockReload = vi.fn();
  let mockLocation: { reload: any; href: string };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLocation = { reload: mockReload, href: "" };
    vi.stubGlobal("location", mockLocation);

    mockNativeBridge.value = undefined;
    resetApkResolutionCacheForTests();
    resetPwaInstallPromptForTests();

    // Default navigator mock
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistration: vi.fn().mockResolvedValue(null),
        getRegistrations: vi.fn().mockResolvedValue([]),
      },
    });

    // Default caches mock
    vi.stubGlobal("caches", {
      keys: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(true),
    });

    // Default storage mocks
    vi.stubGlobal("localStorage", {
      clear: vi.fn(),
    });
    vi.stubGlobal("sessionStorage", {
      clear: vi.fn(),
    });

    // Default fetch mock
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("forceUpdate", () => {
    it("should handle absence of Service Worker support", async () => {
      vi.stubGlobal("navigator", {});
      const { forceUpdate } = usePwaManager();

      await forceUpdate();

      expect(mockToast.error).toHaveBeenCalledWith("Service Worker not available");
    });

    it("should handle missing registrations", async () => {
      (navigator.serviceWorker.getRegistration as any).mockResolvedValue(null);
      const { forceUpdate } = usePwaManager();

      await forceUpdate();

      expect(mockToast.error).toHaveBeenCalledWith("No active session found");
    });

    it("should trigger immediate update if waiting worker exists", async () => {
      const mockRegistration = {
        waiting: true,
        update: vi.fn(),
      };
      (navigator.serviceWorker.getRegistration as any).mockResolvedValue(mockRegistration);

      const { forceUpdate, updateServiceWorker } = usePwaManager();
      const mockUpdateFn = vi.fn();
      updateServiceWorker.value = mockUpdateFn;

      await forceUpdate();

      expect(mockToast.success).toHaveBeenCalledWith("Update ready! Reloading...");
      expect(mockUpdateFn).toHaveBeenCalledWith(true);
    });

    it("should notify when no update is found", async () => {
      const mockRegistration = {
        waiting: false,
        update: vi.fn().mockResolvedValue(undefined),
      };
      (navigator.serviceWorker.getRegistration as any).mockResolvedValue(mockRegistration);

      const { forceUpdate } = usePwaManager();

      await forceUpdate();

      expect(mockToast.success).toHaveBeenCalledWith("Clash Manager is up to date");
    });

    it("should refresh native APK status as part of Refresh App", async () => {
      const mockRegistration = {
        waiting: false,
        update: vi.fn().mockResolvedValue(undefined),
      };
      mockNativeBridge.value = {
        getAppVersionName: vi.fn(() => "14.43.4"),
        getBuildNumber: vi.fn(() => 179),
      };
      (navigator.serviceWorker.getRegistration as any).mockResolvedValue(mockRegistration);
      (fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          buildNumber: 179,
          filename: "clashmanager-v14.43.4+179.apk",
          version: "14.43.4",
        }),
      });

      const { forceUpdate, apkUpdateMessage } = usePwaManager();

      await forceUpdate();

      expect(mockRegistration.update).toHaveBeenCalled();
      expect(fetch).toHaveBeenCalled();
      expect(apkUpdateMessage.value).toBe("Installed APK is current");
      expect(mockToast.success).toHaveBeenCalledWith("Clash Manager is up to date");
    });

    it("should notify when an update is found and downloading", async () => {
      const mockRegistration = {
        waiting: false,
        update: vi.fn().mockImplementation(function(this: any) {
          this.installing = true;
          return Promise.resolve();
        }),
      };
      (navigator.serviceWorker.getRegistration as any).mockResolvedValue(mockRegistration);

      const { forceUpdate } = usePwaManager();

      await forceUpdate();

      expect(mockToast.success).toHaveBeenCalledWith("Update found! Downloading...");
    });

    it("should handle update check failures", async () => {
      (navigator.serviceWorker.getRegistration as any).mockRejectedValue(new Error("Update failed"));
      const { forceUpdate } = usePwaManager();

      await forceUpdate();

      expect(mockToast.error).toHaveBeenCalledWith("Update check failed");
    });
  });

  describe("downloadApk", () => {
    it("should label the installed APK by build number before Android versionCode", () => {
      mockNativeBridge.value = {
        getAppVersionCode: vi.fn(() => 18500),
        getAppVersionName: vi.fn(() => "14.45.0"),
        getBuildNumber: vi.fn(() => 191),
      };

      const { installedApkLabel } = usePwaManager();

      expect(installedApkLabel.value).toBe("v14.45.0 (build 191)");
    });

    it("should prefer same-origin APK metadata when the PWA deploy exposes it", async () => {
      (mockLocation as any).origin = "https://albidr.github.io";
      (fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            buildNumber: 182,
            filename: "clashmanager-v14.43.5+182.apk",
            version: "14.43.5",
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            buildNumber: 179,
            filename: "clashmanager-v14.43.4+179.apk",
            version: "14.43.4",
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue([
            { name: "clashmanager-v14.43.4+179.apk", type: "file" },
          ]),
        });

      const { downloadApk } = usePwaManager();
      await downloadApk();

      expect(fetch).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(/^https:\/\/albidr\.github\.io\/Clash-Manager\/apk\/release\/latest\.json\?t=\d+$/),
        expect.objectContaining({ cache: "no-store" }),
      );
      expect(mockLocation.href).toBe(
        "https://albidr.github.io/Clash-Manager/apk/release/clashmanager-v14.43.5%2B182.apk"
      );
      expect(mockToast.success).toHaveBeenCalledWith("APK download started");
    });

    it("should use the GitHub contents fallback and window.location if latest.json is unavailable", async () => {
      (fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue([
            { name: "latest.json", type: "file" },
            { name: "clashmanager-v14.43.4+179.apk", type: "file" },
          ]),
        })
        .mockRejectedValueOnce(new Error("Network Failure"));

      const { downloadApk } = usePwaManager();
      await downloadApk();

      expect(fetch).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^https:\/\/api\.github\.com\/repos\/AlbiDR\/Clash-Manager\/contents\/APK\/release\?ref=Beta&t=\d+$/,
        ),
        expect.objectContaining({
          cache: "no-store",
          headers: expect.any(Headers),
          signal: expect.any(AbortSignal),
        }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        expect.stringMatching(
          /^https:\/\/raw\.githubusercontent\.com\/AlbiDR\/Clash-Manager\/Beta\/APK\/release\/latest\.json\?t=\d+$/,
        ),
        expect.objectContaining({ cache: "no-store" }),
      );
      expect(mockLocation.href).toBe(
        "https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/clashmanager-v14.43.4%2B179.apk"
      );
      expect(mockToast.info).toHaveBeenCalledWith("Opening APK download...");
      expect(mockToast.success).toHaveBeenCalledWith("APK download started");
      expect(mockToast.remove).toHaveBeenCalledWith("toast-id");
    });

    it("should call downloadApkFile on native bridge when available", async () => {
      const mockDownloadApkFile = vi.fn();
      mockNativeBridge.value = {
        canRequestPackageInstalls: vi.fn(() => true),
        downloadApkFile: mockDownloadApkFile,
        openExternalUrl: vi.fn(),
      };
      (fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          buildNumber: 179,
          filename: "clashmanager-v14.43.4+179.apk",
          version: "14.43.4",
        }),
      });

      const { downloadApk } = usePwaManager();
      await downloadApk();

      expect(mockDownloadApkFile).toHaveBeenCalledWith(
        "https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/clashmanager-v14.43.4%2B179.apk",
        "clashmanager-v14.43.4+179.apk",
        undefined
      );
      expect(mockLocation.href).toBe("");
      expect(mockToast.success).toHaveBeenCalledWith("APK download started");
    });

    it("should pass checksum metadata to the native APK downloader when available", async () => {
      const mockDownloadApkFile = vi.fn();
      mockNativeBridge.value = {
        canRequestPackageInstalls: vi.fn(() => true),
        downloadApkFile: mockDownloadApkFile,
        openExternalUrl: vi.fn(),
      };
      const sha256 = "a".repeat(64);
      (fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          buildNumber: 179,
          filename: "clashmanager-v14.43.4+179.apk",
          sha256,
          version: "14.43.4",
        }),
      });

      const { downloadApk } = usePwaManager();
      await downloadApk();

      expect(mockDownloadApkFile).toHaveBeenCalledWith(
        "https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/clashmanager-v14.43.4%2B179.apk",
        "clashmanager-v14.43.4+179.apk",
        sha256
      );
    });

    it("should use native download when a modern shell has the same versionCode and a newer published buildNumber", async () => {
      const mockDownloadApkFile = vi.fn();
      mockNativeBridge.value = {
        canRequestPackageInstalls: vi.fn(() => true),
        downloadApkFile: mockDownloadApkFile,
        getAppVersionCode: vi.fn(() => 18500),
        getAppVersionName: vi.fn(() => "14.45.0"),
        getBuildNumber: vi.fn(() => 192),
      };
      (fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          buildNumber: 193,
          filename: "clashmanager-v14.45.0+193.apk",
          version: "14.45.0",
        }),
      });

      const { downloadApk, apkUpdateMessage } = usePwaManager();
      await downloadApk();

      expect(mockDownloadApkFile).toHaveBeenCalledWith(
        "https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/clashmanager-v14.45.0%2B193.apk",
        "clashmanager-v14.45.0+193.apk",
        undefined,
      );
      expect(apkUpdateMessage.value).toBe("Download started without checksum metadata");
      expect(mockToast.success).toHaveBeenCalledWith("APK download started");
    });

    it("should open install settings before downloading when APK installs are not allowed", async () => {
      const mockDownloadApkFile = vi.fn();
      const mockOpenPackageInstallSettings = vi.fn();
      mockNativeBridge.value = {
        canRequestPackageInstalls: vi.fn(() => false),
        downloadApkFile: mockDownloadApkFile,
        openPackageInstallSettings: mockOpenPackageInstallSettings,
      };
      (fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          buildNumber: 179,
          filename: "clashmanager-v14.43.4+179.apk",
          version: "14.43.4",
        }),
      });

      const { downloadApk } = usePwaManager();
      await downloadApk();

      expect(mockDownloadApkFile).not.toHaveBeenCalled();
      expect(mockOpenPackageInstallSettings).toHaveBeenCalledOnce();
      expect(mockToast.info).toHaveBeenCalledWith("Allow APK updates in Android, then tap Download Update again");
      expect(mockToast.remove).toHaveBeenCalledWith("toast-id");
    });

    it("should fall back to openExternalUrl if downloadApkFile is absent from bridge", async () => {
      const mockOpenExternal = vi.fn();
      mockNativeBridge.value = {
        canRequestPackageInstalls: vi.fn(() => true),
        openExternalUrl: mockOpenExternal,
      };
      (fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          buildNumber: 179,
          filename: "clashmanager-v14.43.4+179.apk",
          version: "14.43.4",
        }),
      });

      const { downloadApk } = usePwaManager();
      await downloadApk();

      expect(mockOpenExternal).toHaveBeenCalledWith(
        "https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/clashmanager-v14.43.4%2B179.apk"
      );
      expect(mockLocation.href).toBe("");
      expect(mockToast.success).toHaveBeenCalledWith("APK download started");
    });

    it("should use openExternalUrl for legacy updater shells with silent native downloads", async () => {
      const mockDownloadApkFile = vi.fn();
      const mockOpenExternal = vi.fn();
      mockNativeBridge.value = {
        canRequestPackageInstalls: vi.fn(() => true),
        downloadApkFile: mockDownloadApkFile,
        getAppVersionCode: vi.fn(() => 18500),
        getAppVersionName: vi.fn(() => "14.45.0"),
        getBuildNumber: vi.fn(() => 190),
        openExternalUrl: mockOpenExternal,
      };
      (fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          buildNumber: 191,
          filename: "clashmanager-v14.45.0+191.apk",
          version: "14.45.0",
        }),
      });

      const { downloadApk, apkUpdateMessage } = usePwaManager();
      await downloadApk();

      expect(mockDownloadApkFile).not.toHaveBeenCalled();
      expect(mockOpenExternal).toHaveBeenCalledWith(
        "https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/clashmanager-v14.45.0%2B191.apk"
      );
      expect(apkUpdateMessage.value).toBe("Browser download opened for legacy updater shell");
      expect(mockToast.success).toHaveBeenCalledWith("APK download started");
    });

    it("should use native download for build 191 when a newer build is published", async () => {
      const mockDownloadApkFile = vi.fn();
      mockNativeBridge.value = {
        canRequestPackageInstalls: vi.fn(() => true),
        downloadApkFile: mockDownloadApkFile,
        getAppVersionCode: vi.fn(() => 18500),
        getAppVersionName: vi.fn(() => "14.45.0"),
        getBuildNumber: vi.fn(() => 191),
      };
      (fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          buildNumber: 192,
          filename: "clashmanager-v14.45.0+192.apk",
          version: "14.45.0",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        }),
      });

      const { downloadApk } = usePwaManager();
      await downloadApk();

      expect(mockDownloadApkFile).toHaveBeenCalledWith(
        "https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/clashmanager-v14.45.0%2B192.apk",
        "clashmanager-v14.45.0+192.apk",
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      );
    });

    it("should route old native shells through the browser for the bootstrap APK update", async () => {
      const mockDownloadApkFile = vi.fn();
      const mockOpenExternal = vi.fn();
      mockNativeBridge.value = {
        downloadApkFile: mockDownloadApkFile,
        getAppVersionName: vi.fn(() => "14.43.0"),
        openExternalUrl: mockOpenExternal,
      };
      (fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          buildNumber: 190,
          filename: "clashmanager-v14.46.0+190.apk",
          version: "14.46.0",
        }),
      });

      const { downloadApk, apkUpdateMessage } = usePwaManager();
      await downloadApk();

      expect(mockDownloadApkFile).not.toHaveBeenCalled();
      expect(mockOpenExternal).toHaveBeenCalledWith(
        "https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/clashmanager-v14.46.0%2B190.apk"
      );
      expect(apkUpdateMessage.value).toBe("Browser download opened to update native shell");
      expect(mockToast.info).toHaveBeenCalledWith("Install the APK from your browser to unlock native updater permissions");
    });

    it("should not navigate if both latest.json and contents lookup fail", async () => {
      const mockOpenExternal = vi.fn();
      mockNativeBridge.value = { openExternalUrl: mockOpenExternal };
      (fetch as any).mockRejectedValue(new Error("Network Failure"));

      const { downloadApk } = usePwaManager();
      await downloadApk();

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(mockOpenExternal).not.toHaveBeenCalled();
      expect(mockLocation.href).toBe("");
      expect(mockToast.error).toHaveBeenCalledWith("Could not find latest APK");
    });

    it("should not download when the native APK build is already latest", async () => {
      const mockDownloadApkFile = vi.fn();
      mockNativeBridge.value = {
        downloadApkFile: mockDownloadApkFile,
        getAppVersionName: vi.fn(() => "14.43.4"),
        getBuildNumber: vi.fn(() => 179),
      };
      (fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          buildNumber: 179,
          filename: "clashmanager-v14.43.4+179.apk",
          version: "14.43.4",
        }),
      });

      const { downloadApk, apkUpdateMessage, latestApkLabel } = usePwaManager();
      await downloadApk();

      expect(mockDownloadApkFile).not.toHaveBeenCalled();
      expect(mockLocation.href).toBe("");
      expect(apkUpdateMessage.value).toBe("Installed APK is current");
      expect(latestApkLabel.value).toBe("v14.43.4 (179)");
      expect(mockToast.success).toHaveBeenCalledWith("You already have this APK or newer");
      expect(mockToast.remove).toHaveBeenCalledWith("toast-id");
    });

    it("should not download when release metadata points to an older APK versionCode", async () => {
      const mockDownloadApkFile = vi.fn();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockNativeBridge.value = {
        downloadApkFile: mockDownloadApkFile,
        getAppVersionCode: vi.fn(() => 18500),
        getAppVersionName: vi.fn(() => "14.45.0"),
        getBuildNumber: vi.fn(() => 0),
      };
      (fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          buildNumber: 176,
          filename: "clashmanager-v14.43.2+176.apk",
          version: "14.43.2",
        }),
      });

      const { downloadApk, apkUpdateMessage, latestApkLabel } = usePwaManager();
      await downloadApk();

      expect(mockDownloadApkFile).not.toHaveBeenCalled();
      expect(mockLocation.href).toBe("");
      expect(apkUpdateMessage.value).toBe("Release metadata mismatch");
      expect(latestApkLabel.value).toBe("v14.43.2 (176)");
      expect(warnSpy).toHaveBeenCalledWith(
        "[PWA] APK update download blocked because feed is older than installed shell",
        expect.objectContaining({
          installed: "v14.45.0 (code 18500)",
          published: "v14.43.2 (176)",
          sourceName: "Remote latest.json",
          sourceUrl: expect.stringContaining("/APK/release/latest.json"),
        }),
      );
      expect(mockToast.error).toHaveBeenCalledWith("Update feed is stale; download blocked");
      expect(mockToast.remove).toHaveBeenCalledWith("toast-id");

      warnSpy.mockRestore();
    });

    it("should not download an older APK when only native versionName is available", async () => {
      const mockDownloadApkFile = vi.fn();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockNativeBridge.value = {
        downloadApkFile: mockDownloadApkFile,
        getAppVersionName: vi.fn(() => "14.45.0"),
        getBuildNumber: vi.fn(() => 0),
      };
      (fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          buildNumber: 176,
          filename: "clashmanager-v14.43.2+176.apk",
          version: "14.43.2",
        }),
      });

      const { downloadApk, apkUpdateMessage, latestApkLabel } = usePwaManager();
      await downloadApk();

      expect(mockDownloadApkFile).not.toHaveBeenCalled();
      expect(mockLocation.href).toBe("");
      expect(apkUpdateMessage.value).toBe("Release metadata mismatch");
      expect(latestApkLabel.value).toBe("v14.43.2 (176)");
      expect(warnSpy).toHaveBeenCalledWith(
        "[PWA] APK update download blocked because feed is older than installed shell",
        expect.objectContaining({
          installed: "v14.45.0 (native)",
          published: "v14.43.2 (176)",
          sourceName: "Remote latest.json",
          sourceUrl: expect.stringContaining("/APK/release/latest.json"),
        }),
      );
      expect(mockToast.error).toHaveBeenCalledWith("Update feed is stale; download blocked");
      expect(mockToast.remove).toHaveBeenCalledWith("toast-id");

      warnSpy.mockRestore();
    });

    it("should reuse the resolved versioned APK URL for repeated download attempts", async () => {
      (fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          buildNumber: 179,
          filename: "clashmanager-v14.43.4+179.apk",
          version: "14.43.4",
        }),
      });

      const { downloadApk } = usePwaManager();
      await downloadApk();
      await downloadApk();

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(mockLocation.href).toBe(
        "https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/clashmanager-v14.43.4%2B179.apk"
      );
      expect(mockToast.success).toHaveBeenCalledWith("APK download started");
    });

    it("should resolve the versioned APK filename for concurrent callers", async () => {
      (fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          buildNumber: 179,
          filename: "clashmanager-v14.43.4+179.apk",
          version: "14.43.4",
        }),
      });

      const first = resolveLatestApkFilename();
      const second = resolveLatestApkFilename();

      await expect(Promise.all([first, second])).resolves.toEqual([
        "clashmanager-v14.43.4+179.apk",
        "clashmanager-v14.43.4+179.apk",
      ]);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("should show error toast if download execution throws", async () => {
      (fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          buildNumber: 179,
          filename: "clashmanager-v14.43.4+179.apk",
          version: "14.43.4",
        }),
      });

      // Simulate an error by stubbing location to throw on assignment
      Object.defineProperty(mockLocation, "href", {
        set: () => {
          throw new Error("Assign fail");
        },
      });

      const { downloadApk } = usePwaManager();
      await downloadApk();

      expect(mockToast.error).toHaveBeenCalledWith("Failed to open APK download");
      expect(mockToast.remove).toHaveBeenCalledWith("toast-id");
    });
  });

  describe("installPwa", () => {
    function dispatchBeforeInstallPrompt(outcome: "accepted" | "dismissed" = "accepted") {
      const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
        prompt: vi.fn().mockResolvedValue(undefined),
        userChoice: Promise.resolve({ outcome, platform: "web" }),
      });

      window.dispatchEvent(event);
      return event;
    }

    it("captures browser install prompt availability", () => {
      const { isPwaInstallAvailable } = usePwaManager();
      expect(isPwaInstallAvailable.value).toBe(false);

      dispatchBeforeInstallPrompt();

      expect(isPwaInstallAvailable.value).toBe(true);
    });

    it("opens the captured install prompt and reports accepted installs", async () => {
      const installEvent = dispatchBeforeInstallPrompt("accepted");
      const { installPwa, isPwaInstallAvailable } = usePwaManager();

      await installPwa();

      expect(installEvent.prompt).toHaveBeenCalled();
      expect(isPwaInstallAvailable.value).toBe(false);
      expect(mockToast.success).toHaveBeenCalledWith("PWA install started");
    });

    it("clears the captured prompt when the install is dismissed", async () => {
      dispatchBeforeInstallPrompt("dismissed");
      const { installPwa, isPwaInstallAvailable } = usePwaManager();

      await installPwa();

      expect(isPwaInstallAvailable.value).toBe(false);
      expect(mockToast.info).toHaveBeenCalledWith("PWA install dismissed");
    });

    it("shows browser install guidance when no install prompt is available", async () => {
      const { installPwa } = usePwaManager();

      await installPwa();

      expect(mockToast.info).toHaveBeenCalledWith("Use your browser menu to install Clash Manager");
    });
  });

  describe("clearCache", () => {
    it("should do nothing if user denies confirmation", async () => {
      mockConfirm.mockReturnValue(false);
      const { clearCache } = usePwaManager();

      await clearCache();

      expect(navigator.serviceWorker.getRegistrations).not.toHaveBeenCalled();
      expect(mockReload).not.toHaveBeenCalled();
    });

    it("should unregister SWs and delete caches on confirmation", async () => {
      mockConfirm.mockReturnValue(true);
      const mockSW = { unregister: vi.fn() };
      (navigator.serviceWorker.getRegistrations as any).mockResolvedValue([mockSW]);
      (caches.keys as any).mockResolvedValue(["cache-v1", "cache-v2"]);

      const onCleanup = vi.fn();
      const { clearCache } = usePwaManager();

      await clearCache(onCleanup);

      expect(mockSW.unregister).toHaveBeenCalled();
      expect(caches.delete).toHaveBeenCalledWith("cache-v1");
      expect(caches.delete).toHaveBeenCalledWith("cache-v2");
      expect(onCleanup).toHaveBeenCalled();
      expect(mockReload).toHaveBeenCalled();
    });
  });

  describe("factoryReset", () => {
    it("should do nothing if user denies confirmation", async () => {
      mockConfirm.mockReturnValue(false);
      const { factoryReset } = usePwaManager();

      await factoryReset();

      expect(localStorage.clear).not.toHaveBeenCalled();
      expect(mockReload).not.toHaveBeenCalled();
    });

    it("should perform deep cleanup and reload on confirmation", async () => {
      mockConfirm.mockReturnValue(true);
      const mockSW = { unregister: vi.fn() };
      (navigator.serviceWorker.getRegistrations as any).mockResolvedValue([mockSW]);
      (caches.keys as any).mockResolvedValue(["cache-v1"]);

      const onCleanup = vi.fn();
      const { factoryReset } = usePwaManager();

      await factoryReset(onCleanup);

      expect(mockSW.unregister).toHaveBeenCalled();
      expect(caches.delete).toHaveBeenCalledWith("cache-v1");
      expect(localStorage.clear).toHaveBeenCalled();
      expect(sessionStorage.clear).toHaveBeenCalled();
      expect(idb.destroyAll).toHaveBeenCalled();
      expect(onCleanup).toHaveBeenCalled();
      expect(mockReload).toHaveBeenCalled();
    });

    it("should fallback to idb.clear if destroyAll is unavailable", async () => {
      mockConfirm.mockReturnValue(true);
      (idb as any).destroyAll = undefined;

      const { factoryReset } = usePwaManager();
      await factoryReset();

      expect(idb.clear).toHaveBeenCalled();
    });
  });
});
