import { describe, it, expect, vi, beforeEach } from "vitest";
import { useRecruiter } from "../useRecruiter";

// Use vi.hoisted for variables used in vi.mock
const hoisted = vi.hoisted(() => ({
  mockRefreshGas: vi.fn(),
  mockDismissRecruitsAction: vi.fn(() => Promise.resolve({ success: true })),
  mockUndo: vi.fn(),
  mockSuccess: vi.fn(),
  mockError: vi.fn(),
  mockInfo: vi.fn(),
  mockHide: vi.fn(),
  mockRestore: vi.fn(),
  mockPrune: vi.fn(),
  mockHandleSelectScore: vi.fn(),
  mockClearSelection: vi.fn(),
  mockScanRecruitsDirect: vi.fn(() => Promise.resolve([])),
  mockIsWorkerConfigured: vi.fn(() => false),
  mockData: { value: { hh: [{ id: "r1", n: "Recruit 1", potentialScore: 85 }] } },
  mockSelectedIds: { value: [] as string[] },
}));

// Mock dependencies
vi.mock("../useClashData", () => ({
  useClashData: vi.fn(() => ({
    data: hoisted.mockData,
    isHydrated: { value: true },
    isRefreshing: { value: false },
    syncError: { value: null },
    lastSyncTime: { value: Date.now() },
    refresh: hoisted.mockRefreshGas,
  })),
}));

vi.mock("../useApiState", () => ({
  useApiState: vi.fn(() => ({
    pingData: { value: {
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/456",
      sheets: { Headhunter: 123 },
    } },
  })),
}));

vi.mock("../useShowcaseMode", () => ({
  useShowcaseMode: vi.fn(() => ({
    isShowcaseMode: { value: false },
  })),
}));

vi.mock("../useHeadhunter", () => ({
  useHeadhunter: vi.fn(() => ({
    dismissRecruitsAction: hoisted.mockDismissRecruitsAction,
  })),
}));

vi.mock("../useToast", () => ({
  useToast: vi.fn(() => ({
    undo: hoisted.mockUndo,
    success: hoisted.mockSuccess,
    error: hoisted.mockError,
    info: hoisted.mockInfo,
  })),
}));

vi.mock("../useRecruitBlacklist", () => ({
  useRecruitBlacklist: vi.fn(() => ({
    tombstones: { value: new Set() },
    prune: hoisted.mockPrune,
    hide: hoisted.mockHide,
    restore: hoisted.mockRestore,
  })),
}));

vi.mock("../useConsoleController", () => ({
  useConsoleController: vi.fn(() => ({
    searchQuery: { value: "" },
    sortBy: { value: "score" },
    visibleItems: { value: [] },
    expandedIds: { value: new Set() },
    selectedIds: hoisted.mockSelectedIds,
    fabState: { value: { visible: false } },
    isSelectionMode: { value: false },
    status: { value: { type: "ready", text: "Just now" } },
    statsBadge: { value: { label: "Recruits", value: "1" } },
    showSkeletons: { value: false },
    filteredItems: { value: [] },
    updateSort: vi.fn(),
    toggleSelect: vi.fn(),
    toggleExpand: vi.fn(),
    clearSelection: hoisted.mockClearSelection,
    handleAction: vi.fn(),
    handleBlitz: vi.fn(),
    handleSelectAll: vi.fn(),
    handleSelectScore: hoisted.mockHandleSelectScore,
  })),
}));

vi.mock("../../api/gasClient", () => ({
  scanRecruitsDirect: hoisted.mockScanRecruitsDirect,
  isWorkerConfigured: hoisted.mockIsWorkerConfigured,
}));

describe("useRecruiter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    hoisted.mockSelectedIds.value = [];
    hoisted.mockData.value = { hh: [{ id: "r1", n: "Recruit 1", potentialScore: 85 }] };
  });

  it("calculates sheetUrl correctly", () => {
    const { sheetUrl } = useRecruiter();
    expect(sheetUrl.value).toBe("https://docs.google.com/spreadsheets/d/456#gid=123");
  });

  it("provides sort options", () => {
    const { sortOptions } = useRecruiter();
    expect(sortOptions.length).toBeGreaterThan(0);
    expect(sortOptions[0].value).toBe("score");
  });

  it("handles Turbo Scan via Worker when configured", async () => {
    hoisted.mockIsWorkerConfigured.mockReturnValue(true);
    hoisted.mockScanRecruitsDirect.mockResolvedValue([
      { id: "r2", n: "New Recruit", potentialScore: 95 }
    ]);

    const { handleRefresh } = useRecruiter();
    await handleRefresh();

    expect(hoisted.mockInfo).toHaveBeenCalledWith(expect.stringContaining("Turbo Scan"));
    expect(hoisted.mockScanRecruitsDirect).toHaveBeenCalled();
    expect(hoisted.mockSuccess).toHaveBeenCalledWith(expect.stringContaining("Found 1 new recruits"));
    expect(hoisted.mockRefreshGas).toHaveBeenCalled();
  });

  it("handles bulk dismissal", async () => {
    hoisted.mockSelectedIds.value = ["r1", "r2"];
    const { dismissBulk } = useRecruiter();

    dismissBulk();

    expect(hoisted.mockClearSelection).toHaveBeenCalled();
    expect(hoisted.mockHide).toHaveBeenCalledWith(["r1", "r2"]);
    expect(hoisted.mockUndo).toHaveBeenCalledWith(expect.stringContaining("Dismissed 2 recruits"), expect.any(Function));

    // Fast-forward timers for the actual action
    vi.runAllTimers();
    expect(hoisted.mockDismissRecruitsAction).toHaveBeenCalledWith(["r1", "r2"]);
  });

  it("handles score selection", () => {
    const { onSelectScore } = useRecruiter();
    onSelectScore(80, "ge");
    expect(hoisted.mockHandleSelectScore).toHaveBeenCalledWith(80, "ge", expect.any(Function));

    // Test the getter function passed to handleSelectScore
    const getter = hoisted.mockHandleSelectScore.mock.calls[0][2];
    expect(getter({ potentialScore: 90 })).toBe(90);
    expect(getter({})).toBe(0);
  });
});
