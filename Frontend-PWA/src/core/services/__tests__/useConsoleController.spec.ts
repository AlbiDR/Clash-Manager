import { useConsoleController } from "@core";
import { describe, it, expect, vi, beforeEach } from "vitest";

const { sharedState } = vi.hoisted(() => ({
  sharedState: {
    mockBlueprintMode: { value: false },
    mockShowcaseMode: { value: false },
    mockPingData: { 
      value: {
        spreadsheetUrl: "https://docs.google.com/spreadsheets/d/123",
        sheets: { Leaderboard: 456, Headhunter: 789 },
      }
    }
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
      apiStatus: ref("online"),
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
    useUiCoordinator: vi.fn(() => ({
      setFabVisible: vi.fn(),
    })),
  };
});

vi.mock("../useConnectionStatus", () => {
  const { ref } = require("vue");
  return {
    useConnectionStatus: vi.fn(() => ({
      status: ref("online"),
    })),
  };
});

describe("useConsoleController", () => {
  // Use a factory function to get fresh default options
  const createOptions = () => {
      const { ref } = require("vue");
      return {
        data: ref([{ id: "1", n: "Test" }]),
        isHydrated: ref(true),
        isRefreshing: ref(false),
        syncError: ref(null),
        lastSyncTime: ref(Date.now()),
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
    sharedState.mockBlueprintMode.value = false;
    sharedState.mockShowcaseMode.value = false;
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
    const { ref } = require("vue");
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
    const { ref } = require("vue");
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
});
