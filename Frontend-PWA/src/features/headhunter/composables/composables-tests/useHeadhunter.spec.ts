// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { describe, it, expect, vi, beforeEach } from "vitest";
import { reactive, ref, nextTick } from "vue";
import { setActivePinia, createPinia } from 'pinia';
import type { WebAppData, Recruit } from "@core/types";

// --- Mocks ---
const mockSetBadge = vi.fn();
const mockSendLocalNotification = vi.fn();
const mockModules = reactive({
  experimentalNotifications: true,
  notificationBadgeHighPotential: true,
  notificationThreshold: 75,
});
const mockClashData = ref<WebAppData | null>(null);
const mockUpdateLocalData = vi.fn((newData) => {
  mockClashData.value = newData;
});
const mockPost = vi.fn();
const mockIsSyntheticMode = ref(false);

// Mock Specific Modules
vi.mock("@core/services/useBadge", () => ({
  useBadge: () => ({
    setBadge: mockSetBadge,
    sendLocalNotification: mockSendLocalNotification,
  }),
}));

vi.mock("@core/services/useAppSettings", () => ({
  useAppSettings: () => ({
    modules: mockModules,
  }),
}));

vi.mock("@core/services/useClashDataStore", () => ({
  useClashDataStore: () => ({
    data: mockClashData,
    updateLocalData: mockUpdateLocalData,
  }),
}));

vi.mock("@core/services/useBroadcastChannel", () => ({
  useBroadcastChannel: (callback: (msg: any) => void) => {
    (globalThis as any).broadcastCallback = callback;
    return { post: mockPost };
  },
}));

vi.mock("@core/services/useSyntheticMode", () => ({
  useSyntheticMode: () => ({
    isSyntheticMode: mockIsSyntheticMode,
  }),
}));

vi.mock("@core/services/useToast", () => ({
  useToast: () => ({
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  }),
}));

// Mock API specifically
vi.mock("@core/api/SupabaseClient", () => ({
  dismissRecruits: vi.fn().mockResolvedValue({ success: true }),
  undismissRecruits: vi.fn().mockResolvedValue({ success: true }),
  subscribeToBlacklist: vi.fn().mockReturnValue(vi.fn()),

  lastSyncStatus: { value: null },
  NetworkError: class extends Error {
    constructor(m: string) {
      super(m);
      this.name = "NetworkError";
    }
  },
}));

// --- Test Implementation ---
describe("useHeadhunter", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mockIsSyntheticMode.value = false;
    mockClashData.value = null;

    // Reset modules
    mockModules.experimentalNotifications = true;
    mockModules.notificationBadgeHighPotential = true;
    mockModules.notificationThreshold = 75;

    // Reset manually tracked broadcast callback
    delete (globalThis as any).broadcastCallback;
  });

  const sampleRecruit1: Recruit = {
    id: "R1",
    n: "Recruit 1",
    t: 6000,
    potentialScore: 80,
    potentialRawScore: 40000,
    d: { don: 100, war: 10, ago: "2023-01-01", cards: 0 },
  };

  const sampleRecruit2: Recruit = {
    id: "R2",
    n: "Recruit 2",
    t: 5500,
    potentialScore: 60,
    potentialRawScore: 30000,
    d: { don: 50, war: 5, ago: "2023-01-01", cards: 0 },
  };

  const sampleData: WebAppData = {
    lb: [],
    hh: [sampleRecruit1, sampleRecruit2],
    timestamp: 123456789,
  };

  it("should update badge when data is loaded", async () => {
    const { useHeadhunter } = await import("../useHeadhunter");
    useHeadhunter(); // Initialize watcher
    
    mockClashData.value = sampleData;
    await nextTick();

    // With notificationBadgeHighPotential = true and threshold 75, only R1 qualifies
    expect(mockSetBadge).toHaveBeenCalledWith(1);
  });

  it("should update badge with total count if setting is disabled", async () => {
    const { useHeadhunter } = await import("../useHeadhunter");
    useHeadhunter();

    mockModules.notificationBadgeHighPotential = false;
    mockClashData.value = sampleData;
    await nextTick();

    expect(mockSetBadge).toHaveBeenCalledWith(2);
  });

  it("should send notification when an elite recruit is found in new data", async () => {
    const { useHeadhunter } = await import("../useHeadhunter");
    useHeadhunter();

    // Initial state
    mockClashData.value = { ...sampleData, hh: [sampleRecruit2], timestamp: 1000 };
    await nextTick();
    mockSendLocalNotification.mockClear();

    // New data with elite recruit
    mockClashData.value = { ...sampleData, timestamp: 2000 };
    await nextTick();

    expect(mockSendLocalNotification).toHaveBeenCalledWith(
      "Elite Recruit Found",
      expect.stringContaining("score 80"),
      "headhunter-channel"
    );
  });

  it("should NOT send notification if experimentalNotifications is disabled", async () => {
    const { useHeadhunter } = await import("../useHeadhunter");
    useHeadhunter();

    mockModules.experimentalNotifications = false;
    mockClashData.value = { ...sampleData, hh: [sampleRecruit2], timestamp: 1000 };
    await nextTick();

    mockClashData.value = { ...sampleData, timestamp: 2000 };
    await nextTick();

    expect(mockSendLocalNotification).not.toHaveBeenCalled();
  });

  it("should dismiss recruits optimistically", async () => {
    const { useHeadhunter } = await import("../useHeadhunter");
    const { dismissRecruitsAction } = useHeadhunter();
    const { dismissRecruits } = await import("@core/api/SupabaseClient");

    mockClashData.value = sampleData;
    await nextTick();
    mockUpdateLocalData.mockClear();

    await dismissRecruitsAction([{ id: "R1", score: 40000 }]);

    // Check optimistic update
    expect(mockUpdateLocalData).toHaveBeenCalledWith(expect.objectContaining({
      hh: [sampleRecruit2]
    }));

    // Check network call
    expect(dismissRecruits).toHaveBeenCalledWith([{ id: "R1", score: 40000 }]);

    // Check broadcast
    expect(mockPost).toHaveBeenCalledWith({ type: "RECRUIT_DISMISSAL", ids: ["R1"] });
  });

  it("should rollback on logic failure during dismissal", async () => {
    const { useHeadhunter } = await import("../useHeadhunter");
    const { dismissRecruitsAction } = useHeadhunter();
    const { dismissRecruits } = await import("@core/api/SupabaseClient");

    vi.mocked(dismissRecruits).mockRejectedValueOnce(new Error("Server Error"));

    mockClashData.value = sampleData;
    await nextTick();
    mockUpdateLocalData.mockClear();

    await expect(dismissRecruitsAction([{ id: "R1", score: 40000 }])).rejects.toThrow("Server Error");

    // Should have updated twice: once for optimistic, once for rollback
    expect(mockUpdateLocalData).toHaveBeenCalledTimes(2);
    expect(mockUpdateLocalData).toHaveBeenLastCalledWith(sampleData);
  });



  it("should bypass network calls in synthetic mode", async () => {
    const { useHeadhunter } = await import("../useHeadhunter");
    const { dismissRecruitsAction } = useHeadhunter();
    const { dismissRecruits } = await import("@core/api/SupabaseClient");

    mockIsSyntheticMode.value = true;
    mockClashData.value = sampleData;
    await nextTick();

    await dismissRecruitsAction([{ id: "R1", score: 40000 }]);

    expect(mockUpdateLocalData).toHaveBeenCalled();
    expect(dismissRecruits).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("should handle dismissal from another tab", async () => {
    const { useHeadhunter } = await import("../useHeadhunter");
    useHeadhunter();

    mockClashData.value = sampleData;
    await nextTick();
    mockUpdateLocalData.mockClear();

    // Trigger the broadcast callback
    const callback = (globalThis as any).broadcastCallback;
    expect(callback).toBeDefined();
    callback({ type: "RECRUIT_DISMISSAL", ids: ["R1"] });

    expect(mockUpdateLocalData).toHaveBeenCalledWith(expect.objectContaining({
      hh: [sampleRecruit2]
    }));
  });

  it("should restore recruits during undo action", async () => {
    const { useHeadhunter } = await import("../useHeadhunter");
    const { undismissRecruitsAction } = useHeadhunter();
    const { undismissRecruits } = await import("@core/api/SupabaseClient");

    // Start with only R2
    mockClashData.value = { ...sampleData, hh: [sampleRecruit2] };
    await nextTick();
    mockUpdateLocalData.mockClear();

    await undismissRecruitsAction(["R1"], [sampleRecruit1]);

    // Check optimistic restore
    expect(mockUpdateLocalData).toHaveBeenCalledWith(expect.objectContaining({
      hh: expect.arrayContaining([sampleRecruit1, sampleRecruit2])
    }));

    expect(undismissRecruits).toHaveBeenCalledWith(["R1"]);
  });
});
