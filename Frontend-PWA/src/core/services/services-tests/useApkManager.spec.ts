// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
import { useApkManager } from "../useApkManager";
import * as apkResolver from "../apkResolver";
import { useNativeBridge } from "../useNativeBridge";

vi.mock("../useToast", () => ({
  useToast: () => ({
    info: vi.fn(() => 1),
    success: vi.fn(),
    error: vi.fn(),
    remove: vi.fn(),
  }),
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
  };

  beforeEach(() => {
    vi.clearAllMocks();
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
    mockBridge.getAppVersionCode.mockReturnValue(144521);

    vi.spyOn(apkResolver, "resolveLatestApkRelease").mockResolvedValue({
      filename: "clashmanager-v14.45.21.apk",
      version: "14.45.21",
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
    mockBridge.getAppVersionCode.mockReturnValue(144520);
    mockBridge.canRequestPackageInstalls.mockReturnValue(true);

    vi.spyOn(apkResolver, "resolveLatestApkRelease").mockResolvedValue({
      filename: "clashmanager-v14.45.21.apk",
      version: "14.45.21",
      url: "https://example.com/apk",
      sizeBytes: 1024 * 1024 * 5,
    });

    const { checkApkUpdate, apkUpdateState, apkUpdateMessage } = useApkManager();

    await checkApkUpdate();

    expect(apkUpdateState.value).toBe("available");
    expect(apkUpdateMessage.value).toContain("APK update ready");
  });
});
