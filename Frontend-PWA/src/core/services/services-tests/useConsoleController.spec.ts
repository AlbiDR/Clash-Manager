import { useConsoleController } from "@core";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";

const { sharedState } = vi.hoisted(() => ({
  sharedState: {
    mockBlueprintMode: { value: false },
    mockShowcaseMode: { value: false },
    mockPingData: { 
      value: {
        spreadsheetUrl: "https://docs.google.com/spreadsheets/d/123",
        sheets: { Leaderboard: 456, Headhunter: 789 },
      }
    },
    mockApiStatus: { value: "online" },
    mockConnectionStatus: { value: "online" }
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

// Mock useApiState at its actual path
vi.mock("../../api/useApiState", async () => {
  const { ref } = await import("vue");
  return {
    useApiState: vi.fn(() => ({
      pingData: ref(sharedState.mockPingData.value),
      apiStatus: ref(sharedState.mockApiStatus.value),
    })),
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
        currentSource: ref(null as "WORKER" | "GAS" | null),
        hubSyncTime: ref(null as number | null),
        filterFn: (item: any) => [item.n],
        sortStrategies: {},
        defaultSort: "score",
        deepLinkPrefix: "test-",
        batchIdMapper: (item: any) => item.id,
        statsLabel: "Test",
        sheetName: "Leaderboard"
      };
  }

  beforeEach(() => {
    setActivePinia(createPinia());
    sharedState.mockBlueprintMode.value = false;
    sharedState.mockShowcaseMode.value = false;
    sharedState.mockApiStatus.value = "online";
    sharedState.mockConnectionStatus.value = "online";
    vi.clearAllMocks();
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

  it("calculates sheetUrl correctly with string input", () => {
    const options = {
      ...createOptions(),
      sheetName: "Leaderboard",
    };
    const { sheetUrl } = useConsoleController(options);
    expect(sheetUrl.value).toBe("https://docs.google.com/spreadsheets/d/123#gid=456");
  });

  it("calculates sheetUrl correctly with array input (first match)", () => {
    const options = {
      ...createOptions(),
      sheetName: ["NonExistent", "Headhunter"],
    };
    const { sheetUrl } = useConsoleController(options);
    expect(sheetUrl.value).toBe("https://docs.google.com/spreadsheets/d/123#gid=789");
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
    const options = {
      ...createOptions(),
      isRefreshing: ref(true),
      data: ref([]),
    };
    const { layoutProps } = useConsoleController(options);

    expect(layoutProps.value).toMatchObject({
      status: { type: "loading", text: "Syncing..." },
      loading: true,
      isRefreshing: true,
      isEmpty: false,
      selectedCount: 0,
    });
  });

  describe("status hierarchy", () => {
    it("returns 'unconfigured' when apiStatus is unconfigured", () => {
      sharedState.mockApiStatus.value = "unconfigured";
      const { status } = useConsoleController(createOptions());
      expect(status.value).toEqual({ type: "error", text: "Configure URL" });
    });

    it("returns 'waking' when apiStatus is waking", () => {
      sharedState.mockApiStatus.value = "waking";
      const { status } = useConsoleController(createOptions());
      expect(status.value).toEqual({ type: "loading", text: "Waking Server..." });
    });

    it("returns 'offline' when connection status is offline", () => {
      sharedState.mockConnectionStatus.value = "offline";
      const { status } = useConsoleController(createOptions());
      expect(status.value).toEqual({ type: "error", text: "Offline" });
    });

    it("returns 'error' when syncError is present", () => {
      const options = createOptions();
      options.syncError.value = "Some Error";
      const { status } = useConsoleController(options);
      expect(status.value).toEqual({ type: "error", text: "Load Failed" });
    });

    it("returns 'loading' when refreshing and data is empty", () => {
      const options = createOptions();
      options.isRefreshing.value = true;
      options.data.value = [];
      const { status } = useConsoleController(options);
      expect(status.value).toEqual({ type: "loading", text: "Syncing..." });
    });

    it("returns 'ready' with time ago when data is present", () => {
      const options = createOptions();
      const past = Date.now() - 60000; // 1 minute ago
      options.lastSyncTime.value = past;
      options.data.value = [{ id: "1", n: "Test" }];
      const { status } = useConsoleController(options);
      expect(status.value.type).toBe("ready");
      expect(status.value.text).toMatch(/1m ago|just now/);
    });

    it("prioritizes unconfigured over offline", () => {
      sharedState.mockApiStatus.value = "unconfigured";
      sharedState.mockConnectionStatus.value = "offline";
      const { status } = useConsoleController(createOptions());
      expect(status.value.text).toBe("Configure URL");
    });

    it("prioritizes offline over sync error", () => {
      sharedState.mockConnectionStatus.value = "offline";
      const options = createOptions();
      options.syncError.value = "Error";
      const { status } = useConsoleController(options);
      expect(status.value.text).toBe("Offline");
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

  describe("layoutProps and hubInfo", () => {
    it("maps hubInfo correctly when source is present", () => {
      const options = createOptions();
      options.currentSource.value = "WORKER";
      options.hubSyncTime.value = Date.now() - 3600000; // 1h ago
      const { layoutProps } = useConsoleController(options);

      expect(layoutProps.value.hubInfo).toMatchObject({
        source: "WORKER",
      });
      expect(layoutProps.value.hubInfo?.hubAge).toMatch(/1h ago/);
    });

    it("leaves hubInfo undefined when source is null", () => {
      const options = createOptions();
      options.currentSource.value = null;
      const { layoutProps } = useConsoleController(options);
      expect(layoutProps.value.hubInfo).toBeUndefined();
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

  describe("getCardMetadata", () => {
    it("returns correct metadata for an item", () => {
      const options = createOptions();
      options.isRefreshing.value = true;
      const { getCardMetadata, expandedIds, selectedIds } = useConsoleController(options);

      // Default state
      expect(getCardMetadata("1")).toEqual({
        isExpanded: false,
        isSelected: false,
        isRefreshing: false,
      });

      // After expansion
      expandedIds.value.add("1");
      expect(getCardMetadata("1").isExpanded).toBe(true);
      // isRefreshing should be true because item is expanded and global isRefreshing is true
      expect(getCardMetadata("1").isRefreshing).toBe(true);

      // After selection
      selectedIds.value.push("1");
      expect(getCardMetadata("1").isSelected).toBe(true);

      // Non-expanded item should NOT be refreshing even if global isRefreshing is true
      expect(getCardMetadata("2")).toMatchObject({
        isExpanded: false,
        isRefreshing: false,
      });
    });

    it("reflects global refreshing state correctly", () => {
      const options = createOptions();
      options.isRefreshing.value = false;
      const { getCardMetadata, expandedIds } = useConsoleController(options);

      expandedIds.value.add("1");
      expect(getCardMetadata("1").isExpanded).toBe(true);
      expect(getCardMetadata("1").isRefreshing).toBe(false);

      options.isRefreshing.value = true;
      expect(getCardMetadata("1").isRefreshing).toBe(true);
    });
  });
});
