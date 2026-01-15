import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref, computed } from "vue";
import { useConsoleLogic } from "../useConsoleLogic";

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

const mockBlueprintMode = ref(false);
vi.mock("../useBlueprintMode", () => ({
  useBlueprintMode: vi.fn(() => ({
    isBlueprintMode: mockBlueprintMode,
  })),
}));

const mockExhibitionMode = ref(false);
vi.mock("../useExhibitionMode", () => ({
  useExhibitionMode: vi.fn(() => ({
    isExhibitionMode: mockExhibitionMode,
  })),
}));

describe("useConsoleLogic", () => {
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
    mockExhibitionMode.value = false;
    vi.clearAllMocks();
  });

  it("shows skeletons when Blueprint Mode is active", () => {
    mockBlueprintMode.value = true;
    const { showSkeletons } = useConsoleLogic(defaultOptions);
    expect(showSkeletons.value).toBe(true);
  });

  it("does NOT show skeletons when Exhibition Mode is active, even if Blueprint Mode is also active", () => {
    mockBlueprintMode.value = true;
    mockExhibitionMode.value = true;
    const { showSkeletons } = useConsoleLogic(defaultOptions);
    expect(showSkeletons.value).toBe(false);
  });

  it("shows skeletons during initial hydration if refreshing and no data", () => {
    const options = {
      ...defaultOptions,
      isHydrated: ref(false),
      isRefreshing: ref(true),
      data: ref([]),
    };
    const { showSkeletons } = useConsoleLogic(options);
    expect(showSkeletons.value).toBe(true);
  });

  it("hides skeletons once hydrated even if refreshing", () => {
    const options = {
      ...defaultOptions,
      isHydrated: ref(true),
      isRefreshing: ref(true),
      data: ref([{ id: "1", n: "Test" }]),
    };
    const { showSkeletons } = useConsoleLogic(options);
    expect(showSkeletons.value).toBe(false);
  });
});
