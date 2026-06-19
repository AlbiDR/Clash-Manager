// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { useExternalLink, buildDeepLink } from "@core";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// Mock the toast composable
const mockError = vi.fn();
vi.mock("../useToast", () => ({
  useToast: () => ({
    error: mockError,
  }),
}));

describe("useExternalLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset window Properties
    vi.stubGlobal("window", {
      open: vi.fn(() => ({})), // Mock successful window.open
      location: { href: "" },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("Deep Linking (openInGame)", () => {
    it("uses intent:// for Android", async () => {
      vi.stubGlobal("navigator", { userAgent: "Android" });
      const { openInGame } = useExternalLink();
      await openInGame("9PP900");
      expect(window.location.href).toContain("intent://playerInfo?id=9PP900");
    });

    it("uses clashroyale:// for iOS/Desktop", async () => {
      vi.stubGlobal("navigator", { userAgent: "iPhone" });
      const { openInGame } = useExternalLink();
      await openInGame("9PP900");
      expect(window.location.href).toBe("clashroyale://playerInfo?id=9PP900");
    });
  });

  describe("buildDeepLink", () => {
    it("returns intent:// for Android", () => {
      vi.stubGlobal("navigator", { userAgent: "Android" });
      const link = buildDeepLink("9PP900");
      expect(link).toContain("intent://playerInfo?id=9PP900");
    });

    it("returns clashroyale:// for iOS/Desktop", () => {
      vi.stubGlobal("navigator", { userAgent: "iPhone" });
      const link = buildDeepLink("9PP900");
      expect(link).toBe("clashroyale://playerInfo?id=9PP900");
    });
  });

  describe("Native Bridge delegation", () => {
    it("delegates openExternal to AndroidBridge if available", async () => {
      const mockOpenExternalUrl = vi.fn();
      vi.stubGlobal("window", {
        AndroidBridge: {
          openExternalUrl: mockOpenExternalUrl,
        },
      });

      const { openExternal } = useExternalLink();
      await openExternal("https://example.com");

      expect(mockOpenExternalUrl).toHaveBeenCalledWith("https://example.com");
    });

    it("delegates openInGame to AndroidBridge if available", async () => {
      const mockOpenPlayerProfile = vi.fn();
      vi.stubGlobal("window", {
        AndroidBridge: {
          openPlayerProfile: mockOpenPlayerProfile,
        },
      });

      const { openInGame } = useExternalLink();
      await openInGame("#9PP900");

      expect(mockOpenPlayerProfile).toHaveBeenCalledWith("9PP900");
    });

    it("bridge failures currently propagate (unhandled in source)", async () => {
      vi.stubGlobal("window", {
        AndroidBridge: {
          openExternalUrl: () => {
            throw new Error("Bridge Failure");
          },
        },
      });

      const { openExternal } = useExternalLink();
      // [SCENARIO] Bridge throws unexpectedly.
      // [AUDIT] Currently, bridge calls are not wrapped in try-catch in useExternalLink.ts,
      // so the error propagates to the caller.
      await expect(openExternal("https://example.com")).rejects.toThrow("Bridge Failure");
    });
  });

  it("uses standard window.open", async () => {
    const { openExternal } = useExternalLink();
    await openExternal("https://example.com");

    expect(window.open).toHaveBeenCalledWith(
      "https://example.com",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("handles popup blockers in standard web mode", async () => {
    // Mock window.open returning null (blocked)
    vi.stubGlobal("window", {
      open: vi.fn(() => null),
    });
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { openExternal } = useExternalLink();
    await openExternal("https://example.com");

    expect(consoleSpy).toHaveBeenCalledWith(
      "External link blocked or failed to open",
    );
  });

  it("handles errors gracefully", async () => {
    // Force an error
    vi.stubGlobal("window", {
      open: vi.fn(() => {
        throw new Error("Blocked");
      }),
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { openExternal } = useExternalLink();
    await openExternal("https://example.com");

    expect(mockError).toHaveBeenCalledWith("Could not open link");
    expect(consoleSpy).toHaveBeenCalled();
  });
});
