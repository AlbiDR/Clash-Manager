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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref, type Ref } from "vue";
import { useClashSync } from "../useClashSync";
import { fetchRemote, lastSyncStatus } from "../../api/SupabaseClient";
import { loadCache, saveCache } from "../StorageService";
import { generateMockData } from "../../utils/mockData";
import type { WebAppData } from "../../types";

// Mock dependencies
const mockConnectionStatus = {
  isOnline: ref(true)
};
vi.mock("../useConnectionStatus", () => ({
  useConnectionStatus: vi.fn(() => mockConnectionStatus)
}));

const mockWakeLock = {
  request: vi.fn().mockResolvedValue(undefined),
  release: vi.fn().mockResolvedValue(undefined)
};
vi.mock("@shared/composables/useWakeLock", () => ({
  useWakeLock: vi.fn(() => mockWakeLock)
}));

const mockSyntheticMode = {
  isSyntheticMode: ref(false)
};
vi.mock("../useSyntheticMode", () => ({
  useSyntheticMode: vi.fn(() => mockSyntheticMode)
}));

vi.mock("../../api/SupabaseClient", () => ({
  fetchRemote: vi.fn(),
  lastSyncStatus: ref(null)
}));

vi.mock("../StorageService", () => ({
  loadCache: vi.fn(),
  saveCache: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("../../utils/mockData", () => ({
  generateMockData: vi.fn(() => ({
    lb: [],
    hh: [],
    timestamp: 123456789,
    dataSource: "MOCK",
    blacklist: []
  }))
}));

describe("useClashSync", () => {
  let data: Ref<WebAppData | null>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchRemote).mockReset();
    vi.mocked(fetchRemote).mockResolvedValue({ lb: [], hh: [], timestamp: 1000, blacklist: [] });
    vi.useRealTimers();
    data = ref<WebAppData | null>(null) as Ref<WebAppData | null>;
    mockConnectionStatus.isOnline.value = true;
    mockSyntheticMode.isSyntheticMode.value = false;
    lastSyncStatus.value = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should initialize with default values", () => {
    const sync = useClashSync(data);
    expect(sync.loading.value).toBe(false);
    expect(sync.lastSync.value).toBe(0);
    expect(sync.syncError.value).toBe(null);
    expect(sync.dataSource.value).toBe(null);
  });

  describe("loadLocal", () => {
    it("should use synthetic mode if active", async () => {
      mockSyntheticMode.isSyntheticMode.value = true;
      const sync = useClashSync(data);
      await sync.loadLocal();

      expect(generateMockData).toHaveBeenCalled();
      expect(data.value?.dataSource).toBe("MOCK");
    });

    it("should hydrate from cache if valid data exists", async () => {
      const mockCached: WebAppData = {
        lb: [],
        hh: [],
        timestamp: 1000,
        dataSource: "SUPABASE",
        blacklist: []
      };
      vi.mocked(loadCache).mockResolvedValue(mockCached);

      const sync = useClashSync(data);
      await sync.loadLocal();

      expect(data.value).toEqual(mockCached);
      expect(sync.lastSync.value).toBe(1000);
    });

    it("should hydrate an empty ready state when no local cache exists", async () => {
      vi.mocked(loadCache).mockResolvedValue(null);

      const sync = useClashSync(data);
      await sync.loadLocal();

      expect(data.value).toEqual({
        lb: [],
        hh: [],
        timestamp: 0,
        blacklist: [],
      });
      expect(sync.loading.value).toBe(false);
      expect(saveCache).not.toHaveBeenCalled();
    });

    it("should skip cache if currently held data is newer", async () => {
      const existingData: WebAppData = {
        lb: [], hh: [], timestamp: 2000, blacklist: []
      };
      data.value = existingData;

      const mockCached: WebAppData = {
        lb: [], hh: [], timestamp: 1000, blacklist: []
      };
      vi.mocked(loadCache).mockResolvedValue(mockCached);

      const sync = useClashSync(data);
      await sync.loadLocal();

      expect(data.value).toEqual(existingData);
    });

    it("should handle validation failure", async () => {
      vi.mocked(loadCache).mockResolvedValue({ invalid: "data" });
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const sync = useClashSync(data);
      await sync.loadLocal();

      expect(data.value).toEqual({
        lb: [],
        hh: [],
        timestamp: 0,
        blacklist: [],
      });
      expect(consoleSpy).toHaveBeenCalled();
    });

    it("should handle hydration error", async () => {
      vi.mocked(loadCache).mockRejectedValue(new Error("DB Error"));
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const sync = useClashSync(data);
      await sync.loadLocal();

      expect(data.value).toEqual({
        lb: [],
        hh: [],
        timestamp: 0,
        blacklist: [],
      });
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe("updateLocalData", () => {
    it("should update and persist valid payload", async () => {
      const payload = { lb: [], hh: [], timestamp: 3000, blacklist: [] };
      const sync = useClashSync(data);
      await sync.updateLocalData(payload);

      expect(data.value).toEqual(payload);
      expect(saveCache).toHaveBeenCalledWith(payload);
    });

    it("should reject invalid payload", async () => {
      const payload = { invalid: "data" };
      const sync = useClashSync(data);
      await sync.updateLocalData(payload);

      expect(data.value).toBeNull();
      expect(saveCache).not.toHaveBeenCalled();
    });
  });

  describe("refreshFromSupabase", () => {
    it("should sync successfully on happy path", async () => {
      const remotePayload: WebAppData = { lb: [], hh: [], timestamp: 4000, dataSource: "SUPABASE", blacklist: [] };
      vi.mocked(fetchRemote).mockResolvedValue(remotePayload);

      const sync = useClashSync(data);
      await sync.refreshFromSupabase();

      expect(sync.loading.value).toBe(false);
      expect(data.value).toEqual(remotePayload);
    });

    it("should coalesce concurrent callers into one remote attempt", async () => {
      let resolveRemote: (value: WebAppData) => void = () => {};
      const remotePayload: WebAppData = { lb: [], hh: [], timestamp: 4100, blacklist: [] };
      vi.mocked(fetchRemote).mockReturnValue(new Promise((resolve) => {
        resolveRemote = resolve;
      }));
      const sync = useClashSync(data);

      const firstRefresh = sync.refreshFromSupabase();
      const secondRefresh = sync.refreshFromSupabase();

      expect(fetchRemote).toHaveBeenCalledTimes(1);
      resolveRemote(remotePayload);
      await Promise.all([firstRefresh, secondRefresh]);
      expect(data.value).toEqual(remotePayload);
    });

    it("should bypass offline guard for manual refresh", async () => {
      mockConnectionStatus.isOnline.value = false;
      vi.mocked(fetchRemote).mockResolvedValue({ lb: [], hh: [], timestamp: 4500, blacklist: [] });
      const sync = useClashSync(data);

      await sync.refreshFromSupabase();
      expect(fetchRemote).toHaveBeenCalledWith(expect.objectContaining({ force: true }));
      expect(data.value?.timestamp).toBe(4500);
    });

    it("should surface foreground refresh failure even when cached data exists", async () => {
      vi.mocked(fetchRemote).mockRejectedValue(new Error("Network Error"));
      data.value = { lb: [], hh: [], timestamp: 4000, blacklist: [] };
      const sync = useClashSync(data);

      await sync.refreshFromSupabase();

      expect(sync.syncError.value).toBe("Network Error");
    });

    it("should not create a duplicate retry storm after a manual failure", async () => {
      vi.mocked(fetchRemote).mockRejectedValue(new Error("Network Error"));

      const sync = useClashSync(data);
      await sync.refreshFromSupabase();

      expect(fetchRemote).toHaveBeenCalledTimes(1);
      expect(sync.syncError.value).toBe("Network Error");
    });

    it("should time out a stalled foreground refresh and release loading", async () => {
      vi.useFakeTimers();
      vi.mocked(fetchRemote).mockReturnValue(new Promise<WebAppData>(() => {}));
      const sync = useClashSync(data);

      const refreshPromise = sync.refreshFromSupabase();
      const requestSignal = vi.mocked(fetchRemote).mock.calls[0][0]?.signal;
      expect(requestSignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(15000);
      await refreshPromise;

      expect(sync.loading.value).toBe(false);
      expect(sync.syncError.value).toBe("Sync timed out");
      expect(requestSignal?.aborted).toBe(true);
    });
  });

  describe("startBackgroundSync", () => {
    it("should skip background sync when offline unless forced", async () => {
      mockConnectionStatus.isOnline.value = false;
      const sync = useClashSync(data);

      await sync.startBackgroundSync();
      expect(fetchRemote).not.toHaveBeenCalled();

      await sync.startBackgroundSync(true);
      expect(fetchRemote).toHaveBeenCalledWith(expect.objectContaining({ force: true }));
    });

    it("should normalize non-Error failures during remote sync", async () => {
      vi.mocked(fetchRemote).mockRejectedValue("string failure");
      const sync = useClashSync(data);

      await sync.startBackgroundSync();
      expect(sync.syncError.value).toBe("Sync failed");
    });

    it("should share single-flight promise between background sync and manual refresh", async () => {
      let resolveRemote: (value: WebAppData) => void = () => {};
      const remotePayload: WebAppData = { lb: [], hh: [], timestamp: 4200, blacklist: [] };
      vi.mocked(fetchRemote).mockReturnValue(new Promise((resolve) => {
        resolveRemote = resolve;
      }));
      const sync = useClashSync(data);

      const backgroundTask = sync.startBackgroundSync();
      const manualTask = sync.refreshFromSupabase();

      expect(fetchRemote).toHaveBeenCalledTimes(1);
      resolveRemote(remotePayload);
      await Promise.all([backgroundTask, manualTask]);
      expect(data.value).toEqual(remotePayload);
    });

    it("should implement 3-strike rule for error reporting", async () => {
      vi.mocked(fetchRemote).mockRejectedValue(new Error("Fail"));
      const sync = useClashSync(data);
      data.value = { lb: [], hh: [], timestamp: 100, blacklist: [] };

      // Strike 1
      await sync.startBackgroundSync();
      expect(sync.syncError.value).toBeNull();

      // Strike 2
      await sync.startBackgroundSync();
      expect(sync.syncError.value).toBeNull();

      // Strike 3
      await sync.startBackgroundSync();
      expect(sync.syncError.value).toBe("Fail");
    });

    it("should report error immediately if no data exists", async () => {
      vi.mocked(fetchRemote).mockRejectedValue(new Error("Fail"));
      const sync = useClashSync(data);

      await sync.startBackgroundSync();
      expect(sync.syncError.value).toBe("Fail");
    });

    it("should reset error counter on success", async () => {
      vi.mocked(fetchRemote).mockRejectedValueOnce(new Error("Fail"));
      vi.mocked(fetchRemote).mockResolvedValueOnce({ lb: [], hh: [], timestamp: 200, blacklist: [] });
      vi.mocked(fetchRemote).mockRejectedValueOnce(new Error("Fail Again"));

      const sync = useClashSync(data);
      data.value = { lb: [], hh: [], timestamp: 100, blacklist: [] };

      await sync.startBackgroundSync(); // Failure 1
      await sync.startBackgroundSync(); // Success (Resets counter)
      await sync.startBackgroundSync(); // Failure 1 (Again)

      expect(sync.syncError.value).toBeNull();
    });
  });

  describe("updatePlayerLocally", () => {
    it("should update member in leaderboard and persist", async () => {
      data.value = {
        lb: [{ id: "TAG1", n: "Old Name", t: 0, performanceScore: 0, performanceRawScore: 0, d: { role: "member", days: 0, avg: 0, hist: "", winRate: 0 } }],
        hh: [],
        timestamp: 100,
        blacklist: []
      };

      const sync = useClashSync(data);
      await sync.updatePlayerLocally("TAG1", { n: "New Name" });

      expect(data.value.lb[0].n).toBe("New Name");
      expect(saveCache).toHaveBeenCalled();
    });

    it("should reject invalid partial data", async () => {
      data.value = {
        lb: [{ id: "TAG1", n: "Old Name", t: 0, performanceScore: 0, performanceRawScore: 0, d: { role: "member", days: 0, avg: 0, hist: "", winRate: 0 } }],
        hh: [],
        timestamp: 100,
        blacklist: []
      };
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const sync = useClashSync(data);
      await sync.updatePlayerLocally("TAG1", { t: "not a number" } as any);

      expect(data.value.lb[0].t).toBe(0);
      expect(consoleSpy).toHaveBeenCalled();
    });

    it("should do nothing when member tag is not found in leaderboard", async () => {
      data.value = {
        lb: [{ id: "TAG1", n: "Old Name", t: 0, performanceScore: 0, performanceRawScore: 0, d: { role: "member", days: 0, avg: 0, hist: "", winRate: 0 } }],
        hh: [],
        timestamp: 100,
        blacklist: []
      };

      const sync = useClashSync(data);
      await sync.updatePlayerLocally("NONEXISTENT", { n: "New Name" });

      expect(data.value.lb[0].n).toBe("Old Name");
      expect(saveCache).not.toHaveBeenCalled();
    });

    it("should do nothing when data.value is null", async () => {
      data.value = null;

      const sync = useClashSync(data);
      await sync.updatePlayerLocally("TAG1", { n: "New Name" });

      expect(data.value).toBeNull();
      expect(saveCache).not.toHaveBeenCalled();
    });

    it("should log error gracefully if cache persistence fails", async () => {
      data.value = {
        lb: [{ id: "TAG1", n: "Old Name", t: 0, performanceScore: 0, performanceRawScore: 0, d: { role: "member", days: 0, avg: 0, hist: "", winRate: 0 } }],
        hh: [],
        timestamp: 100,
        blacklist: []
      };
      vi.mocked(saveCache).mockRejectedValueOnce(new Error("Storage Full"));
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const sync = useClashSync(data);
      await sync.updatePlayerLocally("TAG1", { n: "New Name" });

      expect(data.value.lb[0].n).toBe("New Name");
      expect(consoleSpy).toHaveBeenCalledWith("[Sync] Failed to persist player update:", expect.any(Error));
    });
  });

  describe("commitSyncResult persistence errors", () => {
    it("should log error gracefully and preserve memory state if cache persistence rejects during commit", async () => {
      const remotePayload: WebAppData = { lb: [], hh: [], timestamp: 4000, dataSource: "SUPABASE", blacklist: [] };
      vi.mocked(fetchRemote).mockResolvedValue(remotePayload);
      vi.mocked(saveCache).mockRejectedValueOnce(new Error("IDB Error"));
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const sync = useClashSync(data);
      await sync.refreshFromSupabase();

      expect(data.value).toEqual(remotePayload);
      expect(consoleSpy).toHaveBeenCalledWith("[Sync] Commit persistence failed:", "IDB Error");
    });
  });

  describe("remote failure state is only cleared by remote evidence", () => {
    it("does not let a purely local edit erase proof that the backend is failing", async () => {
      // [THREAT:] commitSyncResult is the shared commit path for remote syncs
      // AND for local mutations. It cleared consecutiveSyncFailures and
      // syncError unconditionally, so a local edit forged proof of backend
      // health.
      //
      // The worst case is a rollback: when a mutation fails because the backend
      // is unreachable, useHeadhunter's handler restores the old data with
      // updateLocalData(oldData). That very handler then wiped the failure it
      // had just proven, restarting the SYNC_FAILURE_VISIBILITY_THRESHOLD
      // suppression window from zero and hiding the next two failures too.
      vi.mocked(fetchRemote).mockRejectedValue(new Error("Network Error"));
      const sync = useClashSync(data);

      // A manual refresh exposes the error immediately and sets the count to 1.
      await sync.refreshFromSupabase();
      expect(sync.syncError.value).toBe("Network Error");

      // Now a local-only edit, exactly as a failed mutation's rollback does.
      // The minimal shape WebAppDataSchema accepts. A payload with extra keys
      // is REJECTED before commitSyncResult is reached, which made the first
      // version of this test pass without exercising the defect at all.
      await sync.updateLocalData({ lb: [], hh: [], timestamp: 2000, blacklist: [] });

      // The backend has not become reachable, so the evidence must survive.
      expect(sync.syncError.value).toBe("Network Error");
    });

    it("clears the failure state when a remote sync actually succeeds", async () => {
      // The other half: gating the clear must not strand syncError forever.
      vi.mocked(fetchRemote).mockRejectedValueOnce(new Error("Network Error"));
      const sync = useClashSync(data);
      await sync.refreshFromSupabase();
      expect(sync.syncError.value).toBe("Network Error");

      vi.mocked(fetchRemote).mockResolvedValue({ lb: [], hh: [], timestamp: 3000, blacklist: [] });
      await sync.refreshFromSupabase();
      expect(sync.syncError.value).toBe(null);
    });
  });
});
