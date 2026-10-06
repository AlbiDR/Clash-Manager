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
    const HEADHUNTER_SNAPSHOT_URL = `${mockSupabaseUrl}/rest/v1/headhunter_materialized?select=player_tag,s:potential_score`;
    const BLACKLIST_URL = `${mockSupabaseUrl}/rest/v1/recruit_blacklist_view?select=player_tag`;

    /** Answers the snapshot and blacklist reads by URL; both run in parallel. */
    const setSnapshotReads = (recruits: unknown, blacklist: unknown = []) => {
      vi.mocked(fetch).mockImplementation(async (input) => ({
        ok: true,
        json: async () => (String(input) === HEADHUNTER_SNAPSHOT_URL ? recruits : blacklist),
      }) as any);
    };

    const setConfiguredSettings = () => {
      vi.mocked(openDB).mockResolvedValue({} as any);
      vi.mocked(getValue).mockImplementation(async (db, key) => {
        if (key === "cm_notifications_enabled") return true;
        if (key === "cm_supabase_url") return mockSupabaseUrl;
        if (key === "cm_supabase_key") return mockSupabaseKey;
        return null;
      });
    };

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

      setSnapshotReads([
        { player_tag: "#A", s: 85 },
        { player_tag: "#B", s: 70 },
        { player_tag: "#C", s: 90 },
      ]);

      await handleBackgroundSync();

      const restHeaders = {
        headers: {
          "apikey": mockSupabaseKey,
          "Accept-Profile": "features",
          "Cache-Control": "no-cache",
        },
      };
      expect(fetch).toHaveBeenCalledWith(HEADHUNTER_SNAPSHOT_URL, expect.objectContaining(restHeaders));
      expect(fetch).toHaveBeenCalledWith(BLACKLIST_URL, expect.objectContaining(restHeaders));

      // An empty blacklist leaves the snapshot untouched: 85 and 90 >= 80.
      expect(mockSetAppBadge).toHaveBeenCalledWith(2);
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

      setSnapshotReads([{ player_tag: "#A", s: 76 }, { player_tag: "#B", s: 74 }]);

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

      setSnapshotReads([{ player_tag: "#A", s: 50 }]);

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

      setSnapshotReads([{ invalid: "data" }]); // Fails SwSupabaseResponseSchema

      await handleBackgroundSync();

      expect(console.error).toHaveBeenCalledWith("[SW] Background sync: Malformed API response", expect.any(Array));
      expect(mockShowNotification).not.toHaveBeenCalled();
    });

    it("does not count recruits dismissed since the snapshot was taken", async () => {
      setConfiguredSettings();
      setSnapshotReads(
        [
          { player_tag: "#KEPT", s: 90 },
          { player_tag: "#DISMISSED", s: 95 },
          { player_tag: "#UNPREFIXED", s: 85 },
        ],
        // The blacklist view may return a tag without its '#'.
        [{ player_tag: "#DISMISSED" }, { player_tag: "unprefixed" }],
      );

      await handleBackgroundSync();

      expect(mockSetAppBadge).toHaveBeenCalledWith(1);
      expect(mockShowNotification).toHaveBeenCalledWith("New Recruits Available", expect.objectContaining({
        body: "You have 1 recruit above your threshold.",
      }));
    });

    it("leaves the badge as it was when the blacklist cannot be read", async () => {
      setConfiguredSettings();
      vi.mocked(fetch).mockImplementation(async (input) => (String(input) === HEADHUNTER_SNAPSHOT_URL
        ? { ok: true, json: async () => [{ player_tag: "#A", s: 90 }] }
        : { ok: false, status: 503 }) as any);

      await handleBackgroundSync();

      expect(console.error).toHaveBeenCalledWith("[SW] Background sync failed", expect.any(Error));
      expect(mockSetAppBadge).not.toHaveBeenCalled();
      expect(mockClearAppBadge).not.toHaveBeenCalled();
      expect(mockShowNotification).not.toHaveBeenCalled();
      expect(mockGetNotifications).not.toHaveBeenCalled();
    });

    it("leaves the badge as it was when the blacklist is malformed", async () => {
      setConfiguredSettings();
      setSnapshotReads([{ player_tag: "#A", s: 90 }], [{ player_tag: "#A" }, { tag: "#B" }]);

      await handleBackgroundSync();

      expect(console.error).toHaveBeenCalledWith("[SW] Background sync: Malformed blacklist response", expect.any(Array));
      expect(mockSetAppBadge).not.toHaveBeenCalled();
      expect(mockClearAppBadge).not.toHaveBeenCalled();
      expect(mockShowNotification).not.toHaveBeenCalled();
    });
  });
});
