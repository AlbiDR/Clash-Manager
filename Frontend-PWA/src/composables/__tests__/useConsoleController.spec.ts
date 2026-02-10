import { useConsoleController } from "@core";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref, computed } from "vue";
// Mock dependencies
vi.mock("../useBatchQueue", () => ({
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
}));

vi.mock("../useDeepLinkHandler", () => ({
  useDeepLinkHandler: vi.fn(() => ({
    expandedIds: ref(new Set()),
    toggleExpand: vi.fn(),
    processDeepLink: vi.fn(),
  })),
}));

vi.mock("../useListFilter", () => ({
  useListFilter: vi.fn((data) => ({
    searchQuery: ref(""),
    sortBy: ref("score"),
    filteredItems: computed(() => data.value),
    updateSort: vi.fn(),
  })),
}));

vi.mock("../useUiCoordinator", () => ({
  useUiCoordinator: vi.fn(() => ({
    setFabVisible: vi.fn(),
  })),
}));

vi.mock("../useProgressiveList", () => ({
  useProgressiveList: vi.fn((data) => ({
    visibleItems: computed(() => data.value),
  })),
}));

vi.mock("../useConnectionStatus", () => ({
  useConnectionStatus: vi.fn(() => ({
    status: ref("online"),
  })),
}));

const mockPingData = ref({
  spreadsheetUrl: "https://docs.google.com/spreadsheets/d/123",
  sheets: { Leaderboard: 456, Headhunter: 789 },
});
vi.mock("../useApiState", () => ({
  useApiState: vi.fn(() => ({
    pingData: mockPingData,
    apiStatus: ref("online"),
  })),
}));

const mockBlueprintMode = ref(false);
vi.mock("../useBlueprintMode", () => ({
  useBlueprintMode: vi.fn(() => ({
    isBlueprintMode: mockBlueprintMode,
  })),
}));

const mockShowcaseMode = ref(false);
vi.mock("../useShowcaseMode", () => ({
  useShowcaseMode: vi.fn(() => ({
    isShowcaseMode: mockShowcaseMode,
  })),
}));

describe("useConsoleController", () => {
  const defaultOptions = {
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
  };

  beforeEach(() => {
    mockBlueprintMode.value = false;
    mockShowcaseMode.value = false;
    vi.clearAllMocks();
  });

  it("shows skeletons when Blueprint Mode is active", () => {
    mockBlueprintMode.value = true;
    const { showSkeletons } = useConsoleController(defaultOptions);
    expect(showSkeletons.value).toBe(true);
  });

  it("does NOT show skeletons when Showcase Mode is active, even if Blueprint Mode is also active", () => {
    mockBlueprintMode.value = true;
    mockShowcaseMode.value = true;
    const { showSkeletons } = useConsoleController(defaultOptions);
    expect(showSkeletons.value).toBe(false);
  });

  it("shows skeletons during initial hydration if refreshing and no data", () => {
    const options = {
      ...defaultOptions,
      isHydrated: ref(false),
      isRefreshing: ref(true),
      data: ref([]),
    };
    const { showSkeletons } = useConsoleController(options);
    expect(showSkeletons.value).toBe(true);
  });

  it("hides skeletons once hydrated even if refreshing", () => {
    const options = {
      ...defaultOptions,
      isHydrated: ref(true),
      isRefreshing: ref(true),
      data: ref([{ id: "1", n: "Test" }]),
    };
    const { showSkeletons } = useConsoleController(options);
    expect(showSkeletons.value).toBe(false);
  });

  it("calculates sheetUrl correctly with string input", () => {
    const options = {
      ...defaultOptions,
      sheetName: "Leaderboard",
    };
    const { sheetUrl } = useConsoleController(options);
    expect(sheetUrl.value).toBe("https://docs.google.com/spreadsheets/d/123#gid=456");
  });

  it("calculates sheetUrl correctly with array input (first match)", () => {
    const options = {
      ...defaultOptions,
      sheetName: ["NonExistent", "Headhunter"],
    };
    const { sheetUrl } = useConsoleController(options);
    expect(sheetUrl.value).toBe("https://docs.google.com/spreadsheets/d/123#gid=789");
  });

  it("updates searchQuery via handleSearch", () => {
    const { handleSearch, searchQuery } = useConsoleController(defaultOptions);
    handleSearch("New Query");
    expect(searchQuery.value).toBe("New Query");
  });

  it("uses default scoreGetter in handleSelectScore if not provided", () => {
    const scoreGetter = vi.fn((item: any) => item.score);
    const options = {
      ...defaultOptions,
      scoreGetter,
      data: ref([{ id: "1", n: "Test", score: 100 }]),
    };
    const { handleSelectScore } = useConsoleController(options);
    handleSelectScore(50, "ge");
    expect(scoreGetter).toHaveBeenCalled();
  });
});
