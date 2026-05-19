// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useShare } from "../useShare";

/**
 * [TEST] USE SHARE TEST
 * Verifies the Web Share API wrapper, ensuring it correctly detects
 * browser support and handles share results and errors.
 */

describe("useShare", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("should report canShare as false if navigator.share is missing", () => {
    vi.stubGlobal("navigator", {});
    const { canShare } = useShare();
    expect(canShare).toBe(false);
  });

  it("should report canShare as false if navigator is undefined", () => {
    vi.stubGlobal("navigator", undefined);
    const { canShare } = useShare();
    expect(canShare).toBe(false);
  });

  it("should report canShare as true if navigator.share exists", () => {
    vi.stubGlobal("navigator", { share: vi.fn() });
    const { canShare } = useShare();
    expect(canShare).toBe(true);
  });

  it("should call navigator.share when share is called", async () => {
    const mockShare = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share: mockShare });

    const { share } = useShare();
    const shareData = { title: "Test", text: "Test info", url: "https://test.com" };

    await share(shareData);

    expect(mockShare).toHaveBeenCalledWith(shareData);
  });

  it("should handle AbortError silently (user cancelled)", async () => {
    const mockShare = vi.fn().mockRejectedValue({ name: "AbortError" });
    vi.stubGlobal("navigator", { share: mockShare });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { share } = useShare();
    await share({ title: "Test" });

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("should log other errors to console", async () => {
    const mockShare = vi.fn().mockRejectedValue(new Error("Generic error"));
    vi.stubGlobal("navigator", { share: mockShare });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { share } = useShare();
    await share({ title: "Test" });

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("should log warning if share is called but not supported", async () => {
    vi.stubGlobal("navigator", {});
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { share } = useShare();
    await share({ title: "Test" });

    expect(consoleSpy).toHaveBeenCalledWith("Web Share API not supported");
    consoleSpy.mockRestore();
  });
});
