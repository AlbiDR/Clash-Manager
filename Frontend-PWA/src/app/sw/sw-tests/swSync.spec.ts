// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handlePushBadge, handleBackgroundSync } from "../swSync";
import { openDB, getValue } from "../swKernel";
import { NOTIFICATION_TAG_RECRUIT, NOTIFICATION_SHORTCUT_ID } from "../../../core/config";

vi.mock("../swKernel", () => ({
  openDB: vi.fn(),
  getValue: vi.fn(),
}));

describe("swSync", () => {
  const mockShowNotification = vi.fn();
  const mockGetNotifications = vi.fn();
  const mockSetAppBadge = vi.fn();
  const mockClearAppBadge = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.stubGlobal("self", {
      registration: {
        showNotification: mockShowNotification,
        getNotifications: mockGetNotifications,
      },
      navigator: {
        setAppBadge: mockSetAppBadge,
        clearAppBadge: mockClearAppBadge,
      },
    });

    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("console", {
      log: vi.fn(),
      error: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("handlePushBadge", () => {
    it("should show notification when enabled and badgeCount > 0", async () => {
      vi.mocked(openDB).mockResolvedValue({} as any);
      vi.mocked(getValue).mockResolvedValue(true); // enabled

      await handlePushBadge({
        badgeCount: 5,
        title: "Test Title",
        body: "Test Body",
      });

      expect(mockShowNotification).toHaveBeenCalledWith("Test Title", expect.objectContaining({
        body: "Test Body",
        tag: NOTIFICATION_TAG_RECRUIT,
        data: expect.objectContaining({
          count: 5,
          shortcutId: NOTIFICATION_SHORTCUT_ID,
        }),
      }));
      expect(mockSetAppBadge).toHaveBeenCalledWith(5);
    });

    it("should use default text if title/body missing", async () => {
      vi.mocked(openDB).mockResolvedValue({} as any);
      vi.mocked(getValue).mockResolvedValue(true);

      await handlePushBadge({ badgeCount: 1 });

      expect(mockShowNotification).toHaveBeenCalledWith("New Recruits Available", expect.objectContaining({
        body: "You have 1 recruit above your threshold.",
      }));
    });

    it("should default to enabled if setting is missing", async () => {
      vi.mocked(openDB).mockResolvedValue({} as any);
      vi.mocked(getValue).mockResolvedValue(undefined); // missing

      await handlePushBadge({ badgeCount: 2 });

      expect(mockShowNotification).toHaveBeenCalled();
    });

    it("should skip notification if disabled", async () => {
      vi.mocked(openDB).mockResolvedValue({} as any);
      vi.mocked(getValue).mockResolvedValue(false); // disabled

      await handlePushBadge({ badgeCount: 5 });

      expect(mockShowNotification).not.toHaveBeenCalled();
      expect(mockSetAppBadge).toHaveBeenCalledWith(5); // Badge still sets?
    });

    it("should clear badge if badgeCount is 0", async () => {
      vi.mocked(openDB).mockResolvedValue({} as any);
      vi.mocked(getValue).mockResolvedValue(true);

      await handlePushBadge({ badgeCount: 0 });

      expect(mockShowNotification).not.toHaveBeenCalled();
      expect(mockClearAppBadge).toHaveBeenCalled();
    });

    it("should handle missing setAppBadge gracefully", async () => {
      vi.stubGlobal("self", {
        registration: { showNotification: mockShowNotification },
        navigator: {}, // No setAppBadge
      });
      vi.mocked(openDB).mockResolvedValue({} as any);
      vi.mocked(getValue).mockResolvedValue(true);

      await expect(handlePushBadge({ badgeCount: 5 })).resolves.toBeUndefined();
      expect(mockShowNotification).toHaveBeenCalled();
    });
  });

  describe("handleBackgroundSync", () => {
    const mockSupabaseUrl = "https://test.supabase.co";
    const mockSupabaseKey = "test-key";

    it("should abort if notifications are disabled", async () => {
      vi.mocked(openDB).mockResolvedValue({} as any);
      vi.mocked(getValue).mockImplementation(async (db, key) => {
        if (key === "cm_notifications_enabled") return false;
        return null;
      });

      await handleBackgroundSync();

      expect(fetch).not.toHaveBeenCalled();
    });

    it("should abort if Supabase config is missing", async () => {
      vi.mocked(openDB).mockResolvedValue({} as any);
      vi.mocked(getValue).mockImplementation(async (db, key) => {
        if (key === "cm_notifications_enabled") return true;
        if (key === "cm_supabase_url") return null;
        return null;
      });

      await handleBackgroundSync();

      expect(fetch).not.toHaveBeenCalled();
    });

    it("should perform fetch and show notification if recruits meet threshold", async () => {
      vi.mocked(openDB).mockResolvedValue({} as any);
      vi.mocked(getValue).mockImplementation(async (db, key) => {
        if (key === "cm_notifications_enabled") return true;
        if (key === "cm_supabase_url") return mockSupabaseUrl;
        if (key === "cm_supabase_key") return mockSupabaseKey;
        if (key === "cm_notification_threshold") return 80;
        return null;
      });

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => [{ s: 85 }, { s: 70 }, { s: 90 }],
      } as any);

      await handleBackgroundSync();

      expect(fetch).toHaveBeenCalledWith(`${mockSupabaseUrl}/rest/v1/headhunter_view?select=s:potential_score`, expect.objectContaining({
        headers: {
          "apikey": mockSupabaseKey,
          "Accept-Profile": "features",
          "Cache-Control": "no-cache",
        },
      }));

      expect(mockSetAppBadge).toHaveBeenCalledWith(2); // 85 and 90 >= 80
      expect(mockShowNotification).toHaveBeenCalledWith("New Recruits Available", expect.objectContaining({
        body: "You have 2 recruits above your threshold.",
      }));
    });

    it("should use default threshold of 75 if not specified", async () => {
      vi.mocked(openDB).mockResolvedValue({} as any);
      vi.mocked(getValue).mockImplementation(async (db, key) => {
        if (key === "cm_notifications_enabled") return true;
        if (key === "cm_supabase_url") return mockSupabaseUrl;
        if (key === "cm_supabase_key") return mockSupabaseKey;
        return null; // No threshold
      });

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => [{ s: 76 }, { s: 74 }],
      } as any);

      await handleBackgroundSync();

      expect(mockSetAppBadge).toHaveBeenCalledWith(1);
    });

    it("should clear badge and close notifications if no recruits meet threshold", async () => {
      vi.mocked(openDB).mockResolvedValue({} as any);
      vi.mocked(getValue).mockImplementation(async (db, key) => {
        if (key === "cm_notifications_enabled") return true;
        if (key === "cm_supabase_url") return mockSupabaseUrl;
        if (key === "cm_supabase_key") return mockSupabaseKey;
        return null;
      });

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => [{ s: 50 }],
      } as any);

      const mockNotification = { close: vi.fn() };
      mockGetNotifications.mockResolvedValue([mockNotification]);

      await handleBackgroundSync();

      expect(mockNotification.close).toHaveBeenCalled();
      expect(mockClearAppBadge).toHaveBeenCalled();
    });

    it("should log error if fetch fails", async () => {
      vi.mocked(openDB).mockResolvedValue({} as any);
      vi.mocked(getValue).mockResolvedValue(true);
      vi.mocked(getValue).mockImplementation(async (db, key) => {
        if (key === "cm_notifications_enabled") return true;
        if (key === "cm_supabase_url") return mockSupabaseUrl;
        if (key === "cm_supabase_key") return mockSupabaseKey;
        return null;
      });

      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 500,
      } as any);

      await handleBackgroundSync();

      expect(console.error).toHaveBeenCalledWith("[SW] Background sync failed", expect.any(Error));
    });

    it("should abort if API returns malformed data", async () => {
      vi.mocked(openDB).mockResolvedValue({} as any);
      vi.mocked(getValue).mockImplementation(async (db, key) => {
        if (key === "cm_notifications_enabled") return true;
        if (key === "cm_supabase_url") return mockSupabaseUrl;
        if (key === "cm_supabase_key") return mockSupabaseKey;
        return null;
      });

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => [{ invalid: "data" }], // Fails SwSupabaseResponseSchema
      } as any);

      await handleBackgroundSync();

      expect(console.error).toHaveBeenCalledWith("[SW] Background sync: Malformed API response", expect.any(Array));
      expect(mockShowNotification).not.toHaveBeenCalled();
    });
  });
});
