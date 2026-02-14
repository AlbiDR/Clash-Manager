import { describe, it, expect, vi } from "vitest";
import { useLeaderboard } from "../useLeaderboard";
import { ref } from "vue";

// Mock dependencies
const mockData = ref({
  lb: [
    { id: "1", n: "Alice", performanceScore: 80, t: 5000, d: { seen: "1h ago", avg: 10, days: 100 } },
    { id: "2", n: "Bob", performanceScore: 90, t: 6000, d: { seen: "2h ago", avg: 5, days: 50 } }
  ]
});

vi.mock("@core/api/useApiState", () => ({
  useApiState: () => ({
    pingData: ref({
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/123",
      sheets: { Leaderboard: 456 },
    }),
    apiStatus: ref("online"),
  }),
}));

vi.mock("@core/services/useClashData", () => ({
  useClashData: () => ({
    data: mockData,
    isHydrated: ref(true),
    isRefreshing: ref(false),
    syncError: ref(null),
    lastSyncTime: ref(1700000000000),
    refresh: vi.fn(),
  }),
}));

vi.mock("@core/services/useShowcaseMode", () => ({
  useShowcaseMode: () => ({
    isShowcaseMode: ref(false),
  }),
}));

vi.mock("@core/services/useConsoleController", () => ({
  useConsoleController: (config: any) => {
    const searchQuery = ref("");
    return {
      searchQuery,
      handleSearch: (val: string) => { searchQuery.value = val; },
      status: ref({ type: "ready", text: "Ready" }),
      handleSelectScore: vi.fn(),
      handleReset: vi.fn(),
      sortKey: ref(config.defaultSort),
      sortDirection: ref("desc"),
      handleSort: vi.fn(),
      filteredData: mockData.value.lb,
      isSelectionMode: ref(false),
      selectedCount: ref(0),
      selectedIds: ref([]),
      toggleSelection: vi.fn(),
      clearSelection: vi.fn(),
      selectAll: vi.fn(),
    };
  },
}));

// Mock vue-router for useDeepLinkHandler
vi.mock("vue-router", () => ({
  useRoute: vi.fn(() => ({
    query: {},
  })),
}));

describe("useLeaderboard", () => {
  it("calculates sheetUrl correctly with GID", () => {
    const { sheetUrl } = useLeaderboard();
    expect(sheetUrl.value).toBe("https://docs.google.com/spreadsheets/d/123#gid=456");
  });

  it("exposes sortOptions with descriptions", () => {
    const { sortOptions } = useLeaderboard();
    expect(sortOptions.length).toBeGreaterThan(0);
    expect(sortOptions[0]).toHaveProperty("label");
    expect(sortOptions[0]).toHaveProperty("desc");
  });

  it("handles search updates", () => {
    const { handleSearch, searchQuery } = useLeaderboard();
    handleSearch("Alice");
    expect(searchQuery.value).toBe("Alice");
  });

  it("provides status text based on sync state", () => {
    const { status } = useLeaderboard();
    // Since lastSyncTime is 1700000000000, we expect a "ready" type
    expect(status.value.type).toBe("ready");
    expect(typeof status.value.text).toBe("string");
  });
});
