// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useLeaderboard } from "../useLeaderboard";
import { ref } from "vue";
import { setActivePinia, createPinia } from 'pinia';

// Mock dependencies
const mockData = ref({
  lb: [
    { id: "1", n: "Alice", performanceScore: 80, t: 5000, d: { seen: "1h ago", avg: 10, days: 100 } },
    { id: "2", n: "Bob", performanceScore: 90, t: 6000, d: { seen: "2h ago", avg: 5, days: 50 } }
  ]
});

let capturedControllerConfig: any = null;

const mockBlitz = {
  fabState: ref({ count: 2, visible: true, dismissIcon: "trash", harvestEnabled: true }),
  handleAction: vi.fn(),
  handleBlitz: vi.fn(),
  clearSelection: vi.fn(),
};

vi.mock("@core/services/useBlitzMode", () => ({
  useBlitzMode: () => mockBlitz,
}));

vi.mock("@core/api/useApiState", () => ({
  useApiState: () => ({
    pingData: ref({
      dashboardUrl: "https://supabase.com/dashboard/project/clash-manager",
    }),
    apiStatus: ref("online"),
  }),
}));

vi.mock("@core/services/useClashDataStore", () => ({
  useClashDataStore: () => ({
    data: mockData,
    isHydrated: ref(true),
    isRefreshing: ref(false),
    syncError: ref(null),
    lastSyncTime: ref(1700000000000),
    currentSource: ref("SUPABASE"),
    lastCompiledTime: ref(null),
    lastFetchedTime: ref(null),
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
    capturedControllerConfig = config;
    const searchQuery = ref("");
    return {
      searchQuery,
      handleSearch: (val: string) => { searchQuery.value = val; },
      status: ref({ type: "ready", text: "Ready" }),
      handleSelectScore: vi.fn(),
      handleReset: vi.fn(),
      sortBy: ref(config.defaultSort),
      filteredItems: ref(mockData.value.lb),
      isSelectionMode: ref(false),
      selectedIds: ref([]),
      toggleSelection: vi.fn(),
      clearSelection: vi.fn(),
      selectAll: vi.fn(),
      layoutProps: ref({
        status: { type: "ready", text: "Ready" },
        sortOptions: config.sortOptions || []
      }),
      layoutEvents: config.layoutEvents || ref({}),
      fabState: config.fabState || ref({}),
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
  beforeEach(() => {
    setActivePinia(createPinia());
    capturedControllerConfig = null;
  });

  it("exposes layoutProps containing sortOptions with descriptions", () => {
    const { layoutProps } = useLeaderboard();
    const sortOptions = layoutProps.value.sortOptions;
    expect(sortOptions!.length).toBeGreaterThan(0);
    expect(sortOptions![0]).toHaveProperty("label");
    expect(sortOptions![0]).toHaveProperty("desc");
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

  it("shares the history disclosure preference across roster controllers", () => {
    const firstController = useLeaderboard();
    const secondController = useLeaderboard();

    firstController.setHistoryOpen(false);

    expect(secondController.isHistoryOpen.value).toBe(false);

    firstController.setHistoryOpen(true);
  });

  it("configures useConsoleController with correct domain parameters and callbacks", () => {
    useLeaderboard();
    expect(capturedControllerConfig).not.toBeNull();
    expect(capturedControllerConfig.defaultSort).toBe("score");
    expect(capturedControllerConfig.sortPersistenceKey).toBe("cm_console_sort_roster");
    expect(capturedControllerConfig.deepLinkPrefix).toBe("member-");
    expect(capturedControllerConfig.statsLabel).toBe("Member");

    // Test filterFn
    const sampleMember = { id: "#999", n: "Valerie", performanceScore: 95 } as any;
    expect(capturedControllerConfig.filterFn(sampleMember)).toEqual(["Valerie", "#999"]);

    // Test batchIdMapper
    expect(capturedControllerConfig.batchIdMapper(sampleMember)).toBe("#999");

    // Test scoreGetter with score and fallback 0
    expect(capturedControllerConfig.scoreGetter(sampleMember)).toBe(95);
    expect(capturedControllerConfig.scoreGetter({ id: "#000", n: "Zero" } as any)).toBe(0);
  });

  it("overrides fabState and binds layoutEvents to blitz handlers", () => {
    const controller = useLeaderboard();
    const fabState = capturedControllerConfig.fabState.value;
    expect(fabState.dismissIcon).toBe("close");
    expect(fabState.harvestEnabled).toBe(false);
    expect(fabState.count).toBe(2);

    expect(controller.fabState.value.dismissIcon).toBe("close");
    expect(controller.fabState.value.harvestEnabled).toBe(false);

    const layoutEvents = capturedControllerConfig.layoutEvents.value;
    expect(layoutEvents["fab-action"]).toBe(mockBlitz.handleAction);
    expect(layoutEvents["fab-blitz"]).toBe(mockBlitz.handleBlitz);
    expect(layoutEvents["clear-selection"]).toBe(mockBlitz.clearSelection);
    expect(layoutEvents["fab-dismiss"]).toBe(mockBlitz.clearSelection);
  });
});
