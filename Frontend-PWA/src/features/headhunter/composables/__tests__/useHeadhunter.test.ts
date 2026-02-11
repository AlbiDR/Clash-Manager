import { NetworkError } from "@core";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref, reactive, nextTick } from "vue";
import type { WebAppData, Recruit } from "@core/types";
// --- Mocks ---

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

vi.mock("@core", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useBadge: () => ({
      setBadge: mockSetBadge,
      sendLocalNotification: mockSendLocalNotification,
    }),
    useAppSettings: () => ({
      modules: mockModules,
    }),
    useClashData: () => ({
      data: mockClashData,
      updateLocalData: mockUpdateLocalData,
    }),
    useBroadcastChannel: (callback: (msg: any) => void) => {
      (globalThis as any).broadcastCallback = callback;
      return { post: mockPost };
    },
    useSyntheticMode: () => ({
      isSyntheticMode: mockIsSyntheticMode,
    }),
    dismissRecruits: vi.fn().mockResolvedValue({ success: true }),
    undismissRecruits: vi.fn().mockResolvedValue({ success: true }),
  };
});

// --- Test Implementation ---

describe("useHeadhunter", () => {
  beforeEach(async () => {
    vi.resetModules();
    mockSetBadge.mockClear();
    mockSendLocalNotification.mockClear();
    mockUpdateLocalData.mockClear();
    mockPost.mockClear();
    mockIsSyntheticMode.value = false;
    mockClashData.value = null;

    const { dismissRecruits, undismissRecruits } = await import("@core");
    vi.mocked(dismissRecruits).mockClear();
    vi.mocked(undismissRecruits).mockClear();

    // Reset modules
    mockModules.experimentalNotifications = true;
    mockModules.notificationBadgeHighPotential = true;
    mockModules.notificationThreshold = 75;

    // Reset manually tracked broadcast callback
    delete (globalThis as any).broadcastCallback;

    // Import the module to trigger module-level logic (watchers)
    await import("../useHeadhunter");
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
    mockClashData.value = sampleData;
    await nextTick();

    // With notificationBadgeHighPotential = true and threshold 75, only R1 qualifies
    expect(mockSetBadge).toHaveBeenCalledWith(1);
  });

  it("should update badge with total count if setting is disabled", async () => {
    mockModules.notificationBadgeHighPotential = false;
    mockClashData.value = sampleData;
    await nextTick();

    expect(mockSetBadge).toHaveBeenCalledWith(2);
  });

  it("should send notification when an elite recruit is found in new data", async () => {
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
    const { dismissRecruits } = await import("@core");

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
    const { dismissRecruits } = await import("@core");

    vi.mocked(dismissRecruits).mockRejectedValueOnce(new Error("Server Error"));

    mockClashData.value = sampleData;
    await nextTick();
    mockUpdateLocalData.mockClear();

    await expect(dismissRecruitsAction([{ id: "R1", score: 40000 }])).rejects.toThrow("Server Error");

    // Should have updated twice: once for optimistic, once for rollback
    expect(mockUpdateLocalData).toHaveBeenCalledTimes(2);
    expect(mockUpdateLocalData).toHaveBeenLastCalledWith(sampleData);
  });

  it("should NOT rollback on NetworkError (background sync expected)", async () => {
    const { useHeadhunter } = await import("../useHeadhunter");
    const { dismissRecruitsAction } = useHeadhunter();
    const { dismissRecruits } = await import("@core");

    vi.mocked(dismissRecruits).mockRejectedValueOnce(new NetworkError("Timeout"));

    mockClashData.value = sampleData;
    await nextTick();
    mockUpdateLocalData.mockClear();

    await dismissRecruitsAction([{ id: "R1", score: 40000 }]);

    // Should only update once (optimistic)
    expect(mockUpdateLocalData).toHaveBeenCalledTimes(1);
    expect(mockUpdateLocalData).toHaveBeenCalledWith(expect.objectContaining({
      hh: [sampleRecruit2]
    }));
  });

  it("should bypass network calls in synthetic mode", async () => {
    const { useHeadhunter } = await import("../useHeadhunter");
    const { dismissRecruitsAction } = useHeadhunter();
    const { dismissRecruits } = await import("@core");

    mockIsSyntheticMode.value = true;
    mockClashData.value = sampleData;
    await nextTick();

    await dismissRecruitsAction([{ id: "R1", score: 40000 }]);

    expect(mockUpdateLocalData).toHaveBeenCalled();
    expect(dismissRecruits).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("should handle dismissal from another tab", async () => {
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
    const { undismissRecruits } = await import("@core");

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
