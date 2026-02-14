import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref, nextTick } from "vue";

// --- Mocks ---
const mockFetchRemote = vi.hoisted(() => vi.fn());
const mockLoadCache = vi.hoisted(() => vi.fn());
const mockSaveCache = vi.hoisted(() => vi.fn());
const mockGenerateMockData = vi.hoisted(() => vi.fn());

vi.mock("../../api/GasClient", () => ({
  fetchRemote: mockFetchRemote,
}));

vi.mock("../StorageService", () => ({
  loadCache: mockLoadCache,
  saveCache: mockSaveCache,
}));

vi.mock("../../utils/mockData", () => ({
  generateMockData: mockGenerateMockData,
}));

// Shared reactive state for mocks
const isSyntheticMode = ref(false);
const isBlueprintMode = ref(false);
const isShowcaseMode = ref(false);

vi.mock("../useSyntheticMode", () => ({
  useSyntheticMode: () => ({ isSyntheticMode }),
}));
vi.mock("../useBlueprintMode", () => ({
  useBlueprintMode: () => ({ isBlueprintMode }),
}));
vi.mock("../useShowcaseMode", () => ({
  useShowcaseMode: () => ({ isShowcaseMode }),
}));

const mockBroadcastPost = vi.hoisted(() => vi.fn());
const broadcastStore = vi.hoisted(() => ({ handler: null as any }));
vi.mock("../useBroadcastChannel", () => ({
  useBroadcastChannel: (handler: (msg: any) => void) => {
    broadcastStore.handler = handler;
    return { post: mockBroadcastPost };
  },
}));

const mockWakeLockRequest = vi.hoisted(() => vi.fn());
const mockWakeLockRelease = vi.hoisted(() => vi.fn());

const mockSetSyncing = vi.hoisted(() => vi.fn());
const mockSetSuccess = vi.hoisted(() => vi.fn());

vi.mock("../useWakeLock", () => ({
  useWakeLock: () => ({
    request: mockWakeLockRequest,
    release: mockWakeLockRelease,
  }),
}));

vi.mock("../useConnectionStatus", () => ({
  useConnectionStatus: () => ({
    setSyncing: mockSetSyncing,
    setSuccess: mockSetSuccess,
  }),
}));

vi.mock("@shared", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
  };
});

describe("useClashData", () => {
  let useClashData: any;

  beforeEach(async () => {
    vi.useFakeTimers();
    localStorage.clear();
    vi.clearAllMocks();

    // Reset mock states
    isSyntheticMode.value = false;
    isBlueprintMode.value = false;
    isShowcaseMode.value = false;

    // Mock window.requestIdleCallback
    vi.stubGlobal("requestIdleCallback", (cb: Function) => cb());

    // Reset module state by re-importing
    vi.resetModules();
    const module = await import("../useClashData");
    useClashData = module.useClashData;

    // Default fetchRemote mock
    mockFetchRemote.mockResolvedValue({
      lb: [],
      hh: [],
      timestamp: Date.now(),
    });

    // Default saveCache mock (returns promise)
    mockSaveCache.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("initializes with correct default state", () => {
    const { data, isHydrated, isRefreshing, syncStatus, syncError } = useClashData();

    expect(data.value).toBeNull();
    expect(isHydrated.value).toBe(false);
    expect(isRefreshing.value).toBe(false);
    expect(syncStatus.value).toBe("idle");
    expect(syncError.value).toBeNull();
  });

  describe("loadLocal", () => {
    it("hydrates data from IndexedDB if available", async () => {
      const mockData = { lb: [], hh: [], timestamp: Date.now() };
      mockLoadCache.mockResolvedValue(mockData);

      const { data, isHydrated, loadLocal } = useClashData();
      await loadLocal();

      expect(isHydrated.value).toBe(true);
      expect(data.value).toEqual(mockData);
      expect(mockLoadCache).toHaveBeenCalled();
    });

    it("handles missing/null cache data", async () => {
      mockLoadCache.mockResolvedValue(null);
      const { data, isHydrated, loadLocal } = useClashData();

      await loadLocal();

      expect(isHydrated.value).toBe(true);
      expect(data.value).toBeNull();
    });

    it("triggers refresh if data is stale (> 5 mins)", async () => {
      const staleTime = Date.now() - (5 * 60 * 1000 + 1000);
      const staleData = { lb: [], hh: [], timestamp: staleTime };
      mockLoadCache.mockResolvedValue(staleData);

      const { loadLocal } = useClashData();

      await loadLocal();

      expect(mockFetchRemote).toHaveBeenCalled();
    });
  });

  describe("refresh", () => {
    it("updates state on successful sync", async () => {
      const remoteData = { lb: [], hh: [], timestamp: 12345 };
      mockFetchRemote.mockResolvedValue(remoteData);

      const { refresh, data, syncStatus, isRefreshing } = useClashData();

      const refreshPromise = refresh();

      // Advance past the 800ms UX delay
      vi.advanceTimersByTime(800);

      await refreshPromise;

      expect(data.value).toEqual(remoteData);
      expect(syncStatus.value).toBe("success");
      expect(isRefreshing.value).toBe(false);
      expect(mockSetSuccess).toHaveBeenCalled();
    });

    it("handles sync errors", async () => {
      mockFetchRemote.mockRejectedValue(new Error("Network Fail"));

      const { refresh, syncStatus, syncError } = useClashData();

      const refreshPromise = refresh();
      vi.advanceTimersByTime(800);
      await refreshPromise;

      expect(syncStatus.value).toBe("error");
      expect(syncError.value).toBe("Network Fail");
    });

    it("aborts previous request when a new one is started", async () => {
      mockFetchRemote.mockImplementation(({ signal }) => {
        return new Promise((resolve, reject) => {
          if (signal.aborted) {
            reject(new Error("Aborted"));
            return;
          }
          signal.addEventListener("abort", () => {
            reject(new Error("Aborted"));
          });
          // Resolve second request after some time
          if (mockFetchRemote.mock.calls.length === 2) {
            setTimeout(() => resolve({ lb: [], hh: [], timestamp: Date.now() }), 100);
          }
        });
      });

      const { refresh } = useClashData();

      const firstRefresh = refresh();
      const secondRefresh = refresh();

      vi.advanceTimersByTime(1000);
      await secondRefresh;

      // We check if syncStatus is success (from second refresh)
      const { syncStatus } = useClashData();
      expect(syncStatus.value).toBe("success");
    });

    it("times out after 40 seconds", async () => {
      mockFetchRemote.mockImplementation(({ signal }) => {
        return new Promise((resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(new Error("Aborted"));
          });
        });
      });

      const { refresh, syncStatus, syncError } = useClashData();

      const refreshPromise = refresh();

      // Fast-forward 40s
      vi.advanceTimersByTime(40000);

      await refreshPromise;

      expect(syncStatus.value).toBe("error");
      expect(syncError.value).toBe("Request Timed Out");
    });
  });

  describe("modes and side effects", () => {
    it("uses mock data in synthetic mode", async () => {
      isSyntheticMode.value = true;
      const mockData = { lb: [], hh: [], timestamp: 999 };
      mockGenerateMockData.mockReturnValue(mockData);

      const { refresh, data } = useClashData();

      const refreshPromise = refresh();
      vi.advanceTimersByTime(800);
      await refreshPromise;

      expect(data.value).toEqual(mockData);
      expect(mockFetchRemote).not.toHaveBeenCalled();
    });

    it("sets data to null in blueprint mode", async () => {
      isBlueprintMode.value = true;
      const { refresh, data } = useClashData();

      const refreshPromise = refresh();
      vi.advanceTimersByTime(800);
      await refreshPromise;

      expect(data.value).toBeNull();
    });

    it("manages WakeLock during sync", async () => {
      const { refresh } = useClashData();

      const refreshPromise = refresh();
      expect(mockWakeLockRequest).toHaveBeenCalled();

      vi.advanceTimersByTime(800);
      await refreshPromise;
      expect(mockWakeLockRelease).toHaveBeenCalled();
    });

    it("updates local state when DATA_SYNC_SUCCESS is broadcast", async () => {
      const { data, lastSyncTime } = useClashData();
      const newData = { lb: [], hh: [], timestamp: Date.now() + 1000 };
      mockLoadCache.mockResolvedValue(newData);

      if (broadcastStore.handler) {
        await broadcastStore.handler({ type: "DATA_SYNC_SUCCESS", timestamp: newData.timestamp });
      }

      expect(data.value).toEqual(newData);
      expect(lastSyncTime.value).toBe(newData.timestamp);
    });

    it("does not write to localStorage on successful sync (now in gasClient)", async () => {
      const remoteData = { lb: [], hh: [], timestamp: 777 };
      mockFetchRemote.mockResolvedValue(remoteData);

      const { refresh } = useClashData();
      const refreshPromise = refresh();
      vi.advanceTimersByTime(800);
      await refreshPromise;

      const saved = localStorage.getItem("cm_hydration_snapshot");
      expect(saved).toBeNull();
    });
  });

  describe("updateLocalData", () => {
    it("updates local state and persists to IndexedDB", () => {
      const { data, updateLocalData } = useClashData();
      const newData = { lb: [], hh: [], timestamp: 888 };

      updateLocalData(newData);

      expect(data.value).toEqual(newData);
      expect(mockSaveCache).toHaveBeenCalledWith(newData);
    });
  });
});
