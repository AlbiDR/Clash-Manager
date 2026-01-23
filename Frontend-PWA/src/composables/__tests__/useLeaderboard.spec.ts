import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import { useLeaderboard } from "../useLeaderboard";

// Use vi.hoisted for variables used in vi.mock
const {
  mockRefresh,
  mockHandleSelectScore,
  mockSearchState
} = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
  mockHandleSelectScore: vi.fn(),
  mockSearchState: { value: "" },
}));

// Mock dependencies
vi.mock("../useClashData", () => ({
  useClashData: vi.fn(() => ({
    data: { value: { lb: [{ id: "1", n: "Member 1", performanceScore: 90 }] } },
    isHydrated: { value: true },
    isRefreshing: { value: false },
    syncError: { value: null },
    lastSyncTime: { value: Date.now() },
    refresh: mockRefresh,
  })),
}));

vi.mock("../useApiState", () => ({
  useApiState: vi.fn(() => ({
    pingData: { value: {
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/123",
      sheets: { Leaderboard: 0 },
    } },
  })),
}));

vi.mock("../useShowcaseMode", () => ({
  useShowcaseMode: vi.fn(() => ({
    isShowcaseMode: { value: false },
  })),
}));

vi.mock("../useConsoleController", () => ({
  useConsoleController: vi.fn(() => ({
    searchQuery: mockSearchState,
    sortBy: { value: "score" },
    visibleItems: { value: [] },
    expandedIds: { value: new Set() },
    selectedIds: { value: [] },
    fabState: { value: { visible: false } },
    isSelectionMode: { value: false },
    status: { value: { type: "ready", text: "Just now" } },
    statsBadge: { value: { label: "Members", value: "1" } },
    showSkeletons: { value: false },
    filteredItems: { value: [] },
    updateSort: vi.fn(),
    toggleSelect: vi.fn(),
    toggleExpand: vi.fn(),
    clearSelection: vi.fn(),
    handleAction: vi.fn(),
    handleBlitz: vi.fn(),
    handleSelectAll: vi.fn(),
    handleSelectScore: mockHandleSelectScore,
  })),
}));

describe("useLeaderboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchState.value = "";
  });

  it("calculates sheetUrl correctly", () => {
    const { sheetUrl } = useLeaderboard();
    expect(sheetUrl.value).toBe("https://docs.google.com/spreadsheets/d/123#gid=0");
  });

  it("provides sort options", () => {
    const { sortOptions } = useLeaderboard();
    expect(sortOptions.length).toBeGreaterThan(0);
    expect(sortOptions[0].value).toBe("score");
  });

  it("handles search updates", () => {
    const { handleSearch } = useLeaderboard();
    handleSearch("test search");
    expect(mockSearchState.value).toBe("test search");
  });

  it("handles score selection", () => {
    const { onSelectScore } = useLeaderboard();
    onSelectScore(80, "ge");
    expect(mockHandleSelectScore).toHaveBeenCalledWith(80, "ge", expect.any(Function));

    // Test the getter function passed to handleSelectScore
    const getter = mockHandleSelectScore.mock.calls[0][2];
    expect(getter({ performanceScore: 95 })).toBe(95);
    expect(getter({})).toBe(0);
  });
});
