// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useRecruiter } from "../useRecruiter";
import { ref, createApp } from "vue";
import { setActivePinia, createPinia } from 'pinia';
import * as SupabaseClient from "@core/api/SupabaseClient";

// --- Stable Mocks ---
const mockUpdateLocalData = vi.fn();
const mockRefreshStore = vi.fn();
const mockInjectRecruits = vi.fn().mockReturnValue(1);
const mockDismissRecruitsAction = vi.fn().mockResolvedValue(undefined);
const mockUndismissRecruitsAction = vi.fn().mockResolvedValue(undefined);
const mockHide = vi.fn();
const mockRestore = vi.fn();
const mockUndo = vi.fn();
const mockSuccess = vi.fn();
const mockInfo = vi.fn();
const mockError = vi.fn();
const mockTombstones = ref(new Set<string>());
const mockIsOnline = ref(true);

// Define the core mock state globally so it can be used across multiple mocks
const { mockPingData, mockClashData, mockIsShowcaseMode, mockIsSyntheticMode } = vi.hoisted(() => {
  const { ref } = require("vue");
  return {
    mockPingData: ref({
      dashboardUrl: "https://supabase.com/dashboard/project/clash-manager",
    }),
    mockClashData: ref({
      hh: [
        { id: "1", n: "Recruit A", potentialScore: 80, t: 5000, d: { ago: "2024-01-01T00:00:00Z", don: 100, war: 10 } },
        { id: "2", n: "Recruit B", potentialScore: 90, t: 6000, d: { ago: "2024-01-02T00:00:00Z", don: 50, war: 5 } }
      ]
    }),
    mockIsShowcaseMode: ref(false),
    mockIsSyntheticMode: ref(false),
  };
});

// Mock internal core paths
vi.mock("@core/api/useApiState", () => ({
  useApiState: vi.fn(() => ({
    pingData: mockPingData,
    apiStatus: ref("online"),
  })),
}));

vi.mock("@core/services/useClashDataStore", () => ({
  useClashDataStore: vi.fn(() => ({
    data: mockClashData,
    isHydrated: ref(true),
    isRefreshing: ref(false),
    syncError: ref(null),
    lastSyncTime: ref(1700000000000),
    currentSource: ref("SUPABASE"),
    lastCompiledTime: ref(null),
    lastFetchedTime: ref(null),
    refresh: mockRefreshStore,
    refreshFromSupabase: mockRefreshStore,
    updateLocalData: mockUpdateLocalData,
  })),
}));

vi.mock("@core/services/useShowcaseMode", () => ({
  useShowcaseMode: vi.fn(() => ({
    isShowcaseMode: mockIsShowcaseMode,
  })),
}));

vi.mock("@core/services/useSyntheticMode", () => ({
  useSyntheticMode: vi.fn(() => ({
    isSyntheticMode: mockIsSyntheticMode,
  })),
}));

// Fallback for @core alias
vi.mock("@core", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useApiState: vi.fn(() => ({
      pingData: mockPingData,
      apiStatus: ref("online"),
    })),
    useClashDataStore: vi.fn(() => ({
      data: mockClashData,
      isHydrated: ref(true),
      isRefreshing: ref(false),
      syncError: ref(null),
      lastSyncTime: ref(1700000000000),
      currentSource: ref("SUPABASE"),
      lastCompiledTime: ref(null),
      lastFetchedTime: ref(null),
      refresh: mockRefreshStore,
      refreshFromSupabase: mockRefreshStore,
      updateLocalData: mockUpdateLocalData,
    })),
    useShowcaseMode: vi.fn(() => ({
      isShowcaseMode: mockIsShowcaseMode,
    })),
    useSyntheticMode: vi.fn(() => ({
      isSyntheticMode: mockIsSyntheticMode,
    })),
    useToast: vi.fn(() => ({
      undo: mockUndo,
      success: mockSuccess,
      error: mockError,
      info: mockInfo,
    })),
    useConnectionStatus: vi.fn(() => ({
      isOnline: mockIsOnline,
      status: ref("online"),
    })),
    useHaptics: vi.fn(() => ({
      tap: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
    })),
  };
});

vi.mock("@core/api/SupabaseClient", () => ({
  scanRecruitsDirect: vi.fn().mockResolvedValue([]),

  lastSyncStatus: { value: null },
}));

vi.mock("@shared", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useUiCoordinator: vi.fn(() => ({
      setFabVisible: vi.fn(),
    })),
    useConnectionStatus: vi.fn(() => ({
      status: ref("online"),
    })),
    useHaptics: vi.fn(() => ({
      tap: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
    })),
  };
});

vi.mock("../useHeadhunter", () => ({
  useHeadhunter: vi.fn(() => ({
    injectRecruits: mockInjectRecruits,
    dismissRecruitsAction: mockDismissRecruitsAction,
    undismissRecruitsAction: mockUndismissRecruitsAction,
  })),
}));

vi.mock("../useRecruitBlacklist", () => ({
  useRecruitBlacklist: vi.fn(() => ({
    tombstones: mockTombstones,
    hide: mockHide,
    restore: mockRestore,
  })),
}));

vi.mock("@core/services/useConnectionStatus", () => ({
  useConnectionStatus: vi.fn(() => ({
    isOnline: mockIsOnline,
    status: ref("online"),
  })),
}));

vi.mock("@core/services/useToast", () => ({
  useToast: vi.fn(() => ({
    undo: mockUndo,
    success: mockSuccess,
    error: mockError,
    info: mockInfo,
  })),
}));

// Mock vue-router for useDeepLinkHandler
vi.mock("vue-router", () => ({
  useRoute: vi.fn(() => ({
    query: {},
  })),
}));

// Helper to run composables in a component context
function withSetup<T>(composable: () => T): [T, ReturnType<typeof createApp>] {
  let result: T;
  const app = createApp({
    setup() {
      result = composable();
      return () => {};
    },
  });
  app.mount(document.createElement("div"));
  return [result!, app];
}

describe("useRecruiter", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mockIsShowcaseMode.value = false;
    mockIsSyntheticMode.value = false;
    mockIsOnline.value = true;
    mockTombstones.value = new Set();
    mockClashData.value = {
      hh: [
        { id: "1", n: "Recruit A", potentialScore: 80, t: 5000, d: { ago: "2024-01-01T00:00:00Z", don: 100, war: 10 } },
        { id: "2", n: "Recruit B", potentialScore: 90, t: 6000, d: { ago: "2024-01-02T00:00:00Z", don: 50, war: 5 } }
      ]
    };
    mockDismissRecruitsAction.mockResolvedValue(undefined);
  });


  it("exposes layoutProps containing sortOptions with descriptions", () => {
    const [{ layoutProps }] = withSetup(() => useRecruiter());
    const sortOptions = layoutProps.value.sortOptions;
    expect(sortOptions!.length).toBeGreaterThan(0);
    expect(sortOptions![0]).toHaveProperty("label");
    expect(sortOptions![0]).toHaveProperty("desc");
  });

  it("handles search updates", () => {
    const [{ handleSearch, searchQuery }] = withSetup(() => useRecruiter());
    handleSearch("Recruit A");
    expect(searchQuery.value).toBe("Recruit A");
  });

  it("filters recruits based on blacklist", () => {
    mockTombstones.value = new Set(["1"]);
    const [{ filteredItems }] = withSetup(() => useRecruiter());
    expect(filteredItems.value.length).toBe(1);
    expect(filteredItems.value[0].id).toBe("2");
  });

  it("does not dismiss when offline (connectivity guard)", () => {
    mockIsOnline.value = false;
    const [{ dismissBulk, selectedIds }] = withSetup(() => useRecruiter());

    selectedIds.value = ["1"];
    dismissBulk();

    expect(mockHide).not.toHaveBeenCalled();
    expect(mockDismissRecruitsAction).not.toHaveBeenCalled();
    expect(mockInfo).toHaveBeenCalledWith("Connection required to dismiss recruits.");
  });

  describe("handleRefresh", () => {
    it("calls refreshFromSupabase from the store", async () => {
      const [{ refresh }] = withSetup(() => useRecruiter());
      await refresh();
      expect(mockRefreshStore).toHaveBeenCalled();
    });
  });

  describe("dismissBulk", () => {
    it("dismisses selected recruits with optimistic updates", async () => {
      const [{ dismissBulk, selectedIds }] = withSetup(() => useRecruiter());

      selectedIds.value = ["1"];
      dismissBulk();

      expect(mockHide).toHaveBeenCalledWith(["1"]);
      expect(mockDismissRecruitsAction).toHaveBeenCalledWith([
        expect.objectContaining({ id: "1" })
      ]);
      expect(mockUndo).toHaveBeenCalled();
    });

    it("restores visibility if dismissal action fails", async () => {
      const [{ dismissBulk, selectedIds }] = withSetup(() => useRecruiter());

      mockDismissRecruitsAction.mockRejectedValue(new Error("Fail"));

      selectedIds.value = ["1"];
      dismissBulk();

      // We need to wait for the promise rejection to be handled
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockRestore).toHaveBeenCalledWith(["1"]);
    });

    it("restores recruits when undo is clicked", async () => {
      const [{ dismissBulk, selectedIds }] = withSetup(() => useRecruiter());

      selectedIds.value = ["1"];
      dismissBulk();

      // Get the undo callback from the toast mock
      expect(mockUndo).toHaveBeenCalled();
      const undoCallback = mockUndo.mock.calls[0][1];
      undoCallback();

      expect(mockRestore).toHaveBeenCalledWith(["1"]);
      expect(mockUndismissRecruitsAction).toHaveBeenCalledWith(["1"], [mockClashData.value.hh[0]]);
      expect(mockSuccess).toHaveBeenCalledWith("Dismissal cancelled");
    });
  });
});
