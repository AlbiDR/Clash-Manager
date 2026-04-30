// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useClashDataStore } from "../useClashDataStore";
import { useConnectionStatus } from "../useConnectionStatus";
import { useWakeLock } from "../useWakeLock";
import { fetchRemote } from "../../api/SupabaseClient";
import { loadCache, saveCache } from "../StorageService";

// Mock dependencies
const mockConnectionStatus = {
  isOnline: { value: true }
};

vi.mock("../useConnectionStatus", () => ({
  useConnectionStatus: vi.fn(() => mockConnectionStatus)
}));

const mockWakeLock = {
  request: vi.fn().mockResolvedValue(undefined),
  release: vi.fn().mockResolvedValue(undefined),
  isActive: { value: false },
  isSupported: true,
  toggle: vi.fn(),
  init: vi.fn()
};

vi.mock("../useWakeLock", () => ({
  useWakeLock: vi.fn(() => mockWakeLock)
}));

vi.mock("../../api/SupabaseClient", () => ({
  fetchRemote: vi.fn(),
  lastHubDiagnosis: { value: null },
  lastSyncStatus: { value: null }
}));

vi.mock("../StorageService", () => ({
  loadCache: vi.fn(),
  saveCache: vi.fn().mockResolvedValue(undefined),
  idb: {
    get: vi.fn(),
    set: vi.fn()
  }
}));

vi.mock("../useBlueprintMode", () => ({
  useBlueprintMode: vi.fn(() => ({
    isActive: { value: false }
  }))
}));

describe("useClashDataStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("should initialize with default state", () => {
    const store = useClashDataStore();
    expect(store.data).toBeNull();
    expect(store.loading).toBe(false);
    expect(store.lastSync).toBe(0);
    expect(store.syncError).toBeNull();
    expect(store.members).toEqual([]);
    expect(store.recruits).toEqual([]);
    expect(store.isStale).toBe(true);
  });

  it("should calculate staleness correctly", () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-15T12:00:00Z").getTime();
    vi.setSystemTime(now);

    const store = useClashDataStore();

    // Case 1: No sync yet
    expect(store.isStale).toBe(true);

    // Case 2: Just synced
    store.lastSync = now;
    expect(store.isStale).toBe(false);

    // Case 3: Synced 31 minutes ago
    store.lastSync = now - (1000 * 60 * 31);
    expect(store.isStale).toBe(true);
  });

  describe("updateLocalData", () => {
    it("should update data with valid payload", async () => {
      const store = useClashDataStore();
      const validPayload = {
        lb: [],
        hh: [],
        timestamp: Date.now()
      };

      await store.updateLocalData(validPayload);

      expect(store.data).toEqual(validPayload);
      expect(saveCache).toHaveBeenCalledWith(validPayload);
    });

    it("should reject invalid payload", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const store = useClashDataStore();
      const invalidPayload = {
        lb: "not an array",
        timestamp: "not a number"
      };

      await store.updateLocalData(invalidPayload);

      expect(store.data).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("loadLocal", () => {
    it("should hydrate state from cache on success", async () => {
      const mockCachedData = {
        lb: [{ id: "TAG1", n: "Player 1", t: 5000, performanceScore: 90, performanceRawScore: 1000, d: { role: "member", days: 10, avg: 100, hist: "" } }],
        hh: [],
        timestamp: Date.now()
      };
      vi.mocked(loadCache).mockResolvedValue(mockCachedData);

      const store = useClashDataStore();
      await store.loadLocal();

      expect(store.data).toEqual(mockCachedData);
      expect(store.lastSync).toBeGreaterThan(0);
      expect(store.members).toHaveLength(1);
      expect(store.members[0].id).toBe("TAG1");
      expect(store.lastUpdated).toBe(mockCachedData.timestamp);
    });

    it("should handle cache hydration failure gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.mocked(loadCache).mockRejectedValue(new Error("DB Error"));

      const store = useClashDataStore();
      await store.loadLocal();

      expect(store.data).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("startBackgroundSync", () => {
    it("should sync data successfully when online", async () => {
      const mockRemoteData = {
        lb: [],
        hh: [],
        timestamp: Date.now()
      };
      vi.mocked(fetchRemote).mockResolvedValue(mockRemoteData);

      const store = useClashDataStore();
      await store.startBackgroundSync();

      expect(store.loading).toBe(false);
      expect(store.data).toEqual(mockRemoteData);
      expect(mockWakeLock.request).toHaveBeenCalled();
      expect(fetchRemote).toHaveBeenCalled();
      expect(saveCache).toHaveBeenCalledWith(mockRemoteData);
      expect(mockWakeLock.release).toHaveBeenCalled();
    });

    it("should respect offline guard", async () => {
      mockConnectionStatus.isOnline.value = false;

      const store = useClashDataStore();
      await store.startBackgroundSync();

      expect(fetchRemote).not.toHaveBeenCalled();
      mockConnectionStatus.isOnline.value = true;
    });

    it("should override offline guard if force is true", async () => {
      mockConnectionStatus.isOnline.value = false;
      vi.mocked(fetchRemote).mockResolvedValue({ lb: [], hh: [], timestamp: Date.now() });

      const store = useClashDataStore();
      await store.startBackgroundSync(true);

      expect(fetchRemote).toHaveBeenCalled();
      mockConnectionStatus.isOnline.value = true;
    });

    it("should not start sync if already loading", async () => {
      const store = useClashDataStore();
      store.loading = true;

      await store.startBackgroundSync();

      expect(fetchRemote).not.toHaveBeenCalled();
    });

    it("should handle sync failure", async () => {
      vi.mocked(fetchRemote).mockRejectedValue(new Error("API Down"));

      const store = useClashDataStore();
      // Case 1: No data yet -> Immediate error
      await store.startBackgroundSync();

      expect(store.loading).toBe(false);
      expect(store.syncError).toBe("API Down");
      expect(mockWakeLock.release).toHaveBeenCalled();
    });

    it("should tolerate up to 2 consecutive failures if data exists", async () => {
      const store = useClashDataStore();
      store.data = { lb: [], hh: [], timestamp: Date.now() }; // Mock existing data
      vi.mocked(fetchRemote).mockRejectedValue(new Error("Transient Error"));

      // 1st failure
      await store.startBackgroundSync();
      expect(store.syncError).toBeNull(); // Tolerated

      // 2nd failure
      await store.startBackgroundSync();
      expect(store.syncError).toBeNull(); // Tolerated

      // 3rd failure
      await store.startBackgroundSync();
      expect(store.syncError).toBe("Transient Error"); // Surfaced
    });

    it("should reset consecutive failures on success", async () => {
      const store = useClashDataStore();
      store.data = { lb: [], hh: [], timestamp: Date.now() };
      vi.mocked(fetchRemote).mockRejectedValueOnce(new Error("Error 1"));
      
      // 1st failure
      await store.startBackgroundSync();
      
      // Success
      vi.mocked(fetchRemote).mockResolvedValue({ lb: [], hh: [], timestamp: Date.now() });
      await store.startBackgroundSync();
      
      // Another failure (should be considered the new 1st failure)
      vi.mocked(fetchRemote).mockRejectedValue(new Error("Error 2"));
      await store.startBackgroundSync();
      
      expect(store.syncError).toBeNull(); // Still tolerated because counter was reset
    });

    it("should clear syncError on successful sync", async () => {
      const store = useClashDataStore();
      store.syncError = "Previous Error";
      vi.mocked(fetchRemote).mockResolvedValue({ lb: [], hh: [], timestamp: Date.now() });

      await store.startBackgroundSync();

      expect(store.syncError).toBeNull();
    });

    it("should provide refresh() as a wrapper for startBackgroundSync(true)", async () => {
      const mockRemoteData = { lb: [], hh: [], timestamp: Date.now() };
      vi.mocked(fetchRemote).mockResolvedValue(mockRemoteData);
      
      const store = useClashDataStore();
      await store.refresh();
      
      expect(fetchRemote).toHaveBeenCalledWith({ force: true });
      expect(store.data).toEqual(mockRemoteData);
    });
  });

  describe("refreshFromSupabase", () => {
    it("should sync data successfully from Supabase", async () => {
      const mockRemoteData = {
        lb: [],
        hh: [],
        timestamp: Date.now(),
        dataSource: "SUPABASE"
      };
      vi.mocked(fetchRemote).mockResolvedValue(mockRemoteData);

      const store = useClashDataStore();
      await store.refreshFromSupabase();

      expect(store.loading).toBe(false);
      expect(store.data).toEqual(mockRemoteData);
      expect(store.dataSource).toBe("SUPABASE");
      expect(mockWakeLock.request).toHaveBeenCalled();
      expect(fetchRemote).toHaveBeenCalledWith({ force: true });
      expect(saveCache).toHaveBeenCalledWith(mockRemoteData);
      expect(mockWakeLock.release).toHaveBeenCalled();
    });

    it("should attempt fallback to startBackgroundSync(true) if fetchRemote fails [CRACK: Guard Blocked]", async () => {
      // [CRACK IDENTIFIED]: The current implementation of refreshFromSupabase calls startBackgroundSync
      // while loading.value is still true. startBackgroundSync has a guard 'if (loading.value) return;'
      // which causes the fallback to exit immediately without performing the sync.
      vi.mocked(fetchRemote).mockRejectedValueOnce(new Error("Supabase Down"));

      const store = useClashDataStore();
      await store.refreshFromSupabase();

      // [FIX VERIFIED]: Previously failed with 1 due to the loading guard deadlock.
      // Now correctly attempts the fallback (2nd call to fetchRemote).
      expect(fetchRemote).toHaveBeenCalledTimes(2);
      expect(fetchRemote).toHaveBeenCalledWith({ force: true });
    });

    it("should attempt fallback to startBackgroundSync(true) if validation fails", async () => {
      // [FIX VERIFIED]: Previously failed with 1 due to the loading guard deadlock.
      // Now correctly attempts the fallback (2nd call to fetchRemote).
      vi.mocked(fetchRemote).mockResolvedValueOnce({ invalid: "data" });

      const store = useClashDataStore();
      await store.refreshFromSupabase();

      expect(fetchRemote).toHaveBeenCalledTimes(2);
    });

    it("should respect offline guard", async () => {
      mockConnectionStatus.isOnline.value = false;

      const store = useClashDataStore();
      await store.refreshFromSupabase();

      expect(fetchRemote).not.toHaveBeenCalled();
      mockConnectionStatus.isOnline.value = true;
    });

    it("should not start if already loading", async () => {
      const store = useClashDataStore();
      store.loading = true;

      await store.refreshFromSupabase();

      expect(fetchRemote).not.toHaveBeenCalled();
    });
  });

  // [CRACK IDENTIFIED]: triggerUpdate is defined in useClashDataStore.ts but not exported in the return object.
  // It is currently inaccessible for testing or external use.
  describe("updatePlayerLocally", () => {
    const initialData = {
      lb: [
        {
          id: "TAG1",
          n: "Player 1",
          t: 5000,
          performanceScore: 90,
          performanceRawScore: 1000,
          d: { role: "member", days: 10, avg: 100, hist: "" }
        }
      ],
      hh: [],
      timestamp: Date.now()
    };

    it("should update player data with valid partial input", () => {
      const store = useClashDataStore();
      store.data = JSON.parse(JSON.stringify(initialData));

      store.updatePlayerLocally("TAG1", { n: "Updated Name", t: 6000 });

      expect(store.members[0].n).toBe("Updated Name");
      expect(store.members[0].t).toBe(6000);
      expect(store.members[0].id).toBe("TAG1"); // Should preserve other fields
    });

    it("should reject invalid partial data (Validation Boundary)", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const store = useClashDataStore();
      store.data = JSON.parse(JSON.stringify(initialData));

      // @ts-expect-error - testing invalid input
      store.updatePlayerLocally("TAG1", { t: "not a number" });

      expect(store.members[0].t).toBe(5000); // Unchanged
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("should do nothing if player tag is not found", () => {
      const store = useClashDataStore();
      store.data = JSON.parse(JSON.stringify(initialData));

      store.updatePlayerLocally("NONEXISTENT", { n: "Ghost" });

      expect(store.members[0].n).toBe("Player 1");
    });

    it("should do nothing if data is null", () => {
      const store = useClashDataStore();
      store.data = null;

      store.updatePlayerLocally("TAG1", { n: "Ghost" });
      expect(store.data).toBeNull();
    });
  });
});
