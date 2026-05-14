import { useConsoleController } from "@core";
import { useClashDataStore } from "../useClashDataStore";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ref, effectScope } from "vue";

const { sharedState } = vi.hoisted(() => ({
  sharedState: {
    mockBlueprintMode: { value: false },
    mockShowcaseMode: { value: false },
    mockPingData: { 
      value: {
        version: "1.0.0",
        latency: 42,
      }
    },
    mockApiStatus: { value: "online" },
    mockConnectionStatus: { value: "online" },
    mockHasValidConfig: { value: true }
  }
}));

// Mock leaf dependencies first
vi.mock("../useBatchQueue", async () => {
    const { ref } = await import("vue");
    return {
        useBatchQueue: vi.fn(() => ({
            selectedIds: ref([]),
            fabState: ref({ visible: false }),
            isSelectionMode: ref(false),
            toggleSelect: vi.fn(),
            selectAll: vi.fn(),
            clearSelection: vi.fn(),
            handleAction: vi.fn(),
            handleBlitz: vi.fn(),
            setForceSelectionMode: vi.fn(),
        })),
    };
});

vi.mock("../useDeepLinkHandler", async () => {
    const { ref } = await import("vue");
    return {
        useDeepLinkHandler: vi.fn(() => ({
            expandedIds: ref(new Set()),
            toggleExpand: vi.fn(),
            processDeepLink: vi.fn(),
        })),
    };
});

// Mock useClashDataStore first
vi.mock("../useClashDataStore", async () => {
    const { ref } = await import("vue");
    const mockStore = {
        data: ref({ playerTag: null }),
        isHydrated: ref(true),
        isRefreshing: ref(false),
        syncError: ref(null),
        lastSyncTime: ref(0),
        currentSource: ref(null),
        lastCompiledTime: ref(null),
        lastFetchedTime: ref(null),
        loading: ref(false),
        isStale: ref(false),
    };
    return {
        useClashDataStore: vi.fn(() => mockStore),
    };
});

// Mock useApiState at its actual path
vi.mock("../../api/useApiState", async () => {
  const { ref } = await import("vue");
  return {
    useApiState: vi.fn(() => ({
      pingData: ref(sharedState.mockPingData.value),
      apiStatus: ref(sharedState.mockApiStatus.value),
      hasValidConfig: ref(sharedState.mockHasValidConfig.value),
    })),
  };
});

vi.mock("vue", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    onMounted: vi.fn((fn) => fn()),
    onUnmounted: vi.fn((fn) => fn()),
  };
});

vi.mock("../useBlueprintMode", async () => {
  const { ref } = await import("vue");
  return {
    useBlueprintMode: vi.fn(() => ({
      isBlueprintMode: ref(sharedState.mockBlueprintMode.value),
    })),
  };
});

vi.mock("../useShowcaseMode", async () => {
  const { ref } = await import("vue");
  return {
    useShowcaseMode: vi.fn(() => ({
      isShowcaseMode: ref(sharedState.mockShowcaseMode.value),
    })),
  };
});

vi.mock("../useSyntheticMode", async () => {
  const { ref } = await import("vue");
  return {
    useSyntheticMode: vi.fn(() => ({
      isSyntheticMode: ref(false),
    })),
  };
});

vi.mock("@shared", async (importOriginal) => {
  const actual = await importOriginal<any>();
  const { ref } = await import("vue");
  return {
    ...actual,
    useUiCoordinator: vi.fn(() => ({
      setFabVisible: vi.fn(),
    })),
  };
});

vi.mock("../useConnectionStatus", () => {
  const { ref } = require("vue");
  return {
    useConnectionStatus: vi.fn(() => ({
      status: ref(sharedState.mockConnectionStatus.value),
    })),
  };
});

describe("useConsoleController", () => {
  // Use a factory function to get fresh default options
  const createOptions = () => {
      return {
        data: ref([{ id: "1", n: "Test" }]),
        isHydrated: ref(true),
        isRefreshing: ref(false),
        syncError: ref(null),
        lastSyncTime: ref(Date.now()),
        currentSource: ref(null as "SUPABASE" | null),
        lastCompiledTime: ref(null as number | null),
        lastFetchedTime: ref(null as number | null),
        filterFn: (item: any) => [item.n],
        sortStrategies: {},
        defaultSort: "score",
        deepLinkPrefix: "test-",
        batchIdMapper: (item: any) => item.id,
        statsLabel: "Test",
      };
  }

  beforeEach(() => {
    setActivePinia(createPinia());
    sharedState.mockBlueprintMode.value = false;
    sharedState.mockShowcaseMode.value = false;
    sharedState.mockApiStatus.value = "online";
    sharedState.mockConnectionStatus.value = "online";

    // Reset store mock
    const clashStore = useClashDataStore();
    clashStore.isHydrated.value = true;
    clashStore.isRefreshing.value = false;
    clashStore.syncError.value = null;
    clashStore.lastSyncTime.value = Date.now();
    clashStore.currentSource.value = null;
    clashStore.lastCompiledTime.value = null;
    clashStore.lastFetchedTime.value = null;
    clashStore.loading.value = false;
    clashStore.isStale.value = false;
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows skeletons when Blueprint Mode is active", () => {
    sharedState.mockBlueprintMode.value = true;
    const { showSkeletons } = useConsoleController(createOptions());
    expect(showSkeletons.value).toBe(true);
  });

  it("does NOT show skeletons when Showcase Mode is active, even if Blueprint Mode is also active", () => {
    sharedState.mockBlueprintMode.value = true;
    sharedState.mockShowcaseMode.value = true;
    const { showSkeletons } = useConsoleController(createOptions());
    expect(showSkeletons.value).toBe(false);
  });

  it("shows skeletons during initial hydration if refreshing and no data", () => {
    const options = {
      ...createOptions(),
      isHydrated: ref(false),
      isRefreshing: ref(true),
      data: ref([]),
    };
    const { showSkeletons } = useConsoleController(options);
    expect(showSkeletons.value).toBe(true);
  });

  it("hides skeletons once hydrated even if refreshing", () => {
    const options = {
      ...createOptions(),
      isHydrated: ref(true),
      isRefreshing: ref(true),
      data: ref([{ id: "1", n: "Test" }]),
    };
    const { showSkeletons } = useConsoleController(options);
    expect(showSkeletons.value).toBe(false);
  });

  it("updates searchQuery via handleSearch", () => {
    const { handleSearch, searchQuery } = useConsoleController(createOptions());
    handleSearch("New Query");
    expect(searchQuery.value).toBe("New Query");
  });

  it("uses default scoreGetter in handleSelectScore if not provided", () => {
    const { ref } = require("vue");
    const scoreGetter = vi.fn((item: any) => item.score);
    const options = {
      ...createOptions(),
      scoreGetter,
      data: ref([{ id: "1", n: "Test", score: 100 }]),
    };
    const { handleSelectScore } = useConsoleController(options);
    handleSelectScore(50, "ge");
    expect(scoreGetter).toHaveBeenCalled();
  });

  it("exposes standardized layoutProps for ConsoleLayout", () => {
    const clashStore = useClashDataStore();
    clashStore.loading.value = true;
    const options = createOptions();
    options.isRefreshing.value = true;
    const { layoutProps } = useConsoleController(options);

    expect(layoutProps.value).toMatchObject({
      status: { type: "loading", text: "SYNCING" },
      loading: false,
      isRefreshing: true,
      isEmpty: false,
      selectedCount: 0,
    });
  });

  describe("status hierarchy", () => {
    it("returns 'error' when apiStatus is unconfigured", () => {
      sharedState.mockApiStatus.value = "error";
      const { status } = useConsoleController(createOptions());
      expect(status.value).toMatchObject({ type: "error", text: "Invalid API URL" });
    });



    it("returns 'offline' when connection status is offline", () => {
      sharedState.mockConnectionStatus.value = "offline";
      const { status } = useConsoleController(createOptions());
      expect(status.value).toMatchObject({ type: "error", text: "OFFLINE" });
    });

    it("returns 'error' when syncError is present", () => {
      const clashStore = useClashDataStore();
      clashStore.syncError.value = "Some Error";
      const { status } = useConsoleController(createOptions());
      expect(status.value).toMatchObject({ type: "error", text: "Sync Error" });
    });

    it("returns 'loading' when refreshing and data is empty", () => {
      const clashStore = useClashDataStore();
      clashStore.loading.value = true;
      const options = createOptions();
      options.data.value = [];
      const { status } = useConsoleController(options);
      expect(status.value).toMatchObject({ type: "loading", text: "SYNCING" });
    });

    it("returns 'success' with 'DB' label when data is present from Supabase", () => {
      const clashStore = useClashDataStore();
      clashStore.currentSource.value = "SUPABASE";
      
      const options = createOptions();
      const { status } = useConsoleController(options);
      expect(status.value.type).toBe("success");
      expect(status.value.text).toBe("DB");
      expect((status.value as any).nominal).toBe(true);
    });

    it("prioritizes unconfigured over offline", () => {
      sharedState.mockApiStatus.value = "error";
      sharedState.mockConnectionStatus.value = "offline";
      const { status } = useConsoleController(createOptions());
      expect(status.value.text).toBe("Invalid API URL");
    });

    it("prioritizes offline over sync error", () => {
      sharedState.mockConnectionStatus.value = "offline";
      const options = createOptions();
      options.syncError.value = "Error";
      const { status } = useConsoleController(options);
      expect(status.value.text).toBe("OFFLINE");
    });

    it("returns 'Stale' when data is exactly 31 minutes old", () => {
      const clashStore = useClashDataStore();
      const now = Date.now();
      clashStore.lastSyncTime.value = now - 31 * 60000; // 31 minutes ago
      
      const options = createOptions();
      const { status } = useConsoleController(options);
      expect(status.value.type).toBe("warning");
      expect(status.value.text).toBe("STALE");
    });

    it("returns 'DB' when data is exactly 29 minutes old and source is Supabase", () => {
      const clashStore = useClashDataStore();
      clashStore.currentSource.value = "SUPABASE";
      const now = Date.now();
      clashStore.lastSyncTime.value = now - 29 * 60000; // 29 minutes ago
      
      const options = createOptions();
      const { status } = useConsoleController(options);
      expect(status.value.type).toBe("success");
      expect(status.value.text).toBe("DB");
      expect((status.value as any).nominal).toBe(true);
    });

    it("uses lastSyncTime for age calculation", () => {
      const clashStore = useClashDataStore();
      const now = Date.now();
      clashStore.lastSyncTime.value = now - 31 * 60000;   // 31m ago (STALE)
      
      const options = createOptions();
      const { status } = useConsoleController(options);
      expect(status.value.text).toBe("STALE");
    });
  });

  describe("visibility lifecycle", () => {
    it("triggers refresh when app becomes visible after > 30 minutes", () => {
      const scope = effectScope();
      const refresh = vi.fn();
      const options = { ...createOptions(), refresh };

      let visibilityHandler: any;
      const addSpy = vi.spyOn(document, "addEventListener").mockImplementation((event, handler) => {
        if (event === "visibilitychange") visibilityHandler = handler;
      });

      scope.run(() => {
        useConsoleController(options);
      });

      expect(addSpy).toHaveBeenCalledWith("visibilitychange", expect.any(Function));

      // Simulate being hidden
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      visibilityHandler();

      // Advance time by 31 minutes
      vi.advanceTimersByTime(31 * 60000);

      // Simulate being visible
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
      visibilityHandler();

      expect(refresh).toHaveBeenCalled();
      addSpy.mockRestore();
      scope.stop();
    });

    it("does NOT trigger refresh when app becomes visible after < 30 minutes", () => {
      const scope = effectScope();
      const refresh = vi.fn();
      const options = { ...createOptions(), refresh };

      let visibilityHandler: any;
      const addSpy = vi.spyOn(document, "addEventListener").mockImplementation((event, handler) => {
        if (event === "visibilitychange") visibilityHandler = handler;
      });

      scope.run(() => {
        useConsoleController(options);
      });

      // Simulate being hidden
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      visibilityHandler();

      // Advance time by 29 minutes
      vi.advanceTimersByTime(29 * 60000);

      // Simulate being visible
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
      visibilityHandler();

      expect(refresh).not.toHaveBeenCalled();
      addSpy.mockRestore();
      scope.stop();
    });
  });

  describe("Showcase Mode", () => {
    it("limits visibleItems to 1 item regardless of filtered count", () => {
      sharedState.mockShowcaseMode.value = true;
      const options = createOptions();
      options.data.value = [{ id: "1" }, { id: "2" }, { id: "3" }];
      const { visibleItems, filteredItems } = useConsoleController(options);

      expect(filteredItems.value).toHaveLength(3);
      expect(visibleItems.value).toHaveLength(1);
    });
  });

  describe("statsBadge", () => {
    it("returns correct count in normal mode", () => {
      const options = createOptions();
      options.data.value = [{ id: "1" }, { id: "2" }];
      const { statsBadge } = useConsoleController(options);
      expect(statsBadge.value).toEqual({ label: "Tests", value: "2" });
    });

    it("returns count of 1 in Showcase mode", () => {
      sharedState.mockShowcaseMode.value = true;
      const options = createOptions();
      options.data.value = [{ id: "1" }, { id: "2" }];
      const { statsBadge } = useConsoleController(options);
      expect(statsBadge.value).toEqual({ label: "Test", value: "1" });
    });

    it("returns mock counts in Blueprint mode", () => {
      sharedState.mockBlueprintMode.value = true;

      // Member case
      const memberOptions = createOptions();
      memberOptions.statsLabel = "Member";
      const { statsBadge: memberBadge } = useConsoleController(memberOptions);
      expect(memberBadge.value.value).toBe("50"); // DEFAULT_MOCK_MEMBER_COUNT

      // Recruit case
      const recruitOptions = createOptions();
      recruitOptions.statsLabel = "Recruit";
      const { statsBadge: recruitBadge } = useConsoleController(recruitOptions);
      expect(recruitBadge.value.value).toBe("20"); // DEFAULT_MOCK_RECRUIT_COUNT (fixed from 100)
    });
  });

  describe("store fallback mechanism", () => {
    it("falls back to useClashDataStore for sync status when omitted from options", () => {
      const clashStore = useClashDataStore();
      clashStore.loading.value = false;
      clashStore.syncError.value = "Store Error";

      // Pass only the data, omit other reactive flags to trigger fallback
      const { isRefreshing, syncError, status } = useConsoleController({
          data: ref([{ id: "1", n: "Test" }]),
          sortStrategies: { score: (a: any, b: any) => 0 },
          defaultSort: "score",
          filterFn: (item: any) => [item.n],
      } as any);

      expect(isRefreshing.value).toBe(false);
      expect(syncError.value).toBe("Store Error");
      expect(status.value.text).toBe("Sync Error");
    });
  });

  describe("layoutProps and hubInfo", () => {
    it("maps hubInfo correctly when source is present", () => {
      const clashStore = useClashDataStore();
      clashStore.currentSource.value = "SUPABASE";
      clashStore.lastCompiledTime.value = Date.now() - 3600000; // 1h ago
      
      const { layoutProps } = useConsoleController(createOptions());

      expect(layoutProps.value.remoteInfo).toMatchObject({
        source: "SUPABASE",
      });
      expect(layoutProps.value.remoteInfo?.dataAge).toBeDefined();
    });

    it("falls back to lastSyncTime for hubAge if lastCompiledTime is missing", () => {
      const clashStore = useClashDataStore();
      clashStore.currentSource.value = "SUPABASE";
      clashStore.lastCompiledTime.value = null;
      clashStore.lastSyncTime.value = Date.now() - 7200000; // 2h ago
      
      const { layoutProps } = useConsoleController(createOptions());

      expect(layoutProps.value.remoteInfo?.dataAge).toMatch(/2h ago/);
    });

    it("defaults hubInfo to LOCAL source when currentSource is null", () => {
      const clashStore = useClashDataStore();
      clashStore.currentSource.value = null;
      const { layoutProps } = useConsoleController(createOptions());
      expect(layoutProps.value.remoteInfo?.source).toBe("LOCAL");
    });

    it("sets isEmpty correctly when data is empty and not loading", () => {
      const options = createOptions();
      options.data.value = [];
      options.isRefreshing.value = false;
      options.isHydrated.value = true;
      const { layoutProps } = useConsoleController(options);
      expect(layoutProps.value.isEmpty).toBe(true);
    });
  });

  describe("layoutEvents", () => {
    it("triggers refresh correctly", () => {
      const refresh = vi.fn();
      const options = { ...createOptions(), refresh };
      const { layoutEvents } = useConsoleController(options);
      layoutEvents.value.refresh();
      expect(refresh).toHaveBeenCalled();
    });

    it("triggers handleSearch correctly via update:search", () => {
      const { layoutEvents, searchQuery } = useConsoleController(createOptions());
      layoutEvents.value["update:search"]("Search Trigger");
      expect(searchQuery.value).toBe("Search Trigger");
    });
  });

  describe("getMemoKeys", () => {
    it("returns a stable array of dependencies including extraKeys", () => {
      const options = createOptions();
      const { getMemoKeys } = useConsoleController(options);
      const extra = ["custom-key"];
      const keys = getMemoKeys("1", extra);

      expect(keys).toContain("1");
      expect(keys).toContain("custom-key");
      expect(keys).toHaveLength(7); // id, isSelectionMode, expanded, selected, isRefreshingExpanded, isTagged, +1 extra
    });
  });

  describe("getCardMetadata", () => {
    it("returns correct metadata for an item", () => {
      const options = createOptions();
      options.isRefreshing.value = true;
      const { getCardMetadata, expandedIds, selectedIds } = useConsoleController(options);

      // Default state
      expect(getCardMetadata("1")).toEqual({
        expanded: false,
        selected: false,
        selectionMode: false,
        isTagged: false,
        appIsRefreshing: false,
      });

      // After expansion
      expandedIds.value.add("1");
      expect(getCardMetadata("1").expanded).toBe(true);
      // appIsRefreshing should be true because item is expanded and global isRefreshing is true
      expect(getCardMetadata("1").appIsRefreshing).toBe(true);

      // After selection
      selectedIds.value.push("1");
      expect(getCardMetadata("1").selected).toBe(true);

      // Non-expanded item should NOT be refreshing even if global isRefreshing is true
      expect(getCardMetadata("2")).toMatchObject({
        expanded: false,
        appIsRefreshing: false,
      });
    });

    it("reflects global refreshing state correctly", () => {
      const options = createOptions();
      options.isRefreshing.value = false;
      const { getCardMetadata, expandedIds } = useConsoleController(options);

      expandedIds.value.add("1");
      expect(getCardMetadata("1").expanded).toBe(true);
      expect(getCardMetadata("1").appIsRefreshing).toBe(false);

      options.isRefreshing.value = true;
      expect(getCardMetadata("1").appIsRefreshing).toBe(true);
    });
  });
});
