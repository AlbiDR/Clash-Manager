import { describe, it, expect, vi } from "vitest";
import { useRecruiter } from "../useRecruiter";
import { ref } from "vue";

// Mock dependencies
vi.mock("../useClashData", () => ({
  useClashData: vi.fn(() => ({
    data: ref({
      hh: [
        { id: "1", n: "Recruit A", potentialScore: 80, t: 5000, d: { ago: "2024-01-01T00:00:00Z", don: 100, war: 10 } },
        { id: "2", n: "Recruit B", potentialScore: 90, t: 6000, d: { ago: "2024-01-02T00:00:00Z", don: 50, war: 5 } }
      ]
    }),
    isHydrated: ref(true),
    isRefreshing: ref(false),
    syncError: ref(null),
    lastSyncTime: ref(1700000000000),
    refresh: vi.fn(),
    updateLocalData: vi.fn(),
  })),
}));

vi.mock("../useApiState", () => ({
  useApiState: vi.fn(() => ({
    pingData: ref({
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/123",
      sheets: { Headhunter: 789 },
    }),
  })),
}));

vi.mock("../useShowcaseMode", () => ({
  useShowcaseMode: vi.fn(() => ({
    isShowcaseMode: ref(false),
  })),
}));

vi.mock("../useHeadhunter", () => ({
  useHeadhunter: vi.fn(() => ({
    dismissRecruitsAction: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("../useRecruitBlacklist", () => ({
  useRecruitBlacklist: vi.fn(() => ({
    tombstones: ref(new Set()),
    prune: vi.fn(),
    hide: vi.fn(),
    restore: vi.fn(),
  })),
}));

vi.mock("../useToast", () => ({
  useToast: vi.fn(() => ({
    undo: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  })),
}));

vi.mock("../../api/GasClient", () => ({
  scanRecruitsDirect: vi.fn().mockResolvedValue([]),
  isWorkerConfigured: vi.fn().mockReturnValue(false),
}));

// Mock useUiCoordinator to avoid DOM issues
vi.mock("@shared", () => ({
  useUiCoordinator: vi.fn(() => ({
    setFabVisible: vi.fn(),
  })),
}));

// Mock vue-router for useDeepLinkHandler
vi.mock("vue-router", () => ({
  useRoute: vi.fn(() => ({
    query: {},
  })),
}));

describe("useRecruiter", () => {
  it("calculates sheetUrl correctly with Headhunter GID", () => {
    const { sheetUrl } = useRecruiter();
    expect(sheetUrl.value).toBe("https://docs.google.com/spreadsheets/d/123#gid=789");
  });

  it("exposes sortOptions with descriptions", () => {
    const { sortOptions } = useRecruiter();
    expect(sortOptions.length).toBeGreaterThan(0);
    expect(sortOptions[0]).toHaveProperty("label");
    expect(sortOptions[0]).toHaveProperty("desc");
  });

  it("handles search updates", () => {
    const { handleSearch, searchQuery } = useRecruiter();
    handleSearch("Recruit A");
    expect(searchQuery.value).toBe("Recruit A");
  });

  it("filters recruits based on blacklist", () => {
    const { filteredItems } = useRecruiter();
    // Initially both should be there (blacklist is empty in mock)
    expect(filteredItems.value.length).toBe(2);
  });
});
