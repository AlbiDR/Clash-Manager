import { resetApiState, useApiState } from "@core";
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as gasClient from "@core";

// Mock gasClient
vi.mock("../../api/gasClient", () => ({
  isConfigured: vi.fn(() => true),
  ping: vi.fn(),
  getApiUrl: vi.fn(() => "https://mock-gas-url.com"),
}));

describe("useApiState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetApiState();
  });

  it("sets status to online when ping succeeds with status 'online'", async () => {
    const mockPingResponse = {
      status: "online",
      version: "11.0.1",
      modules: { API_PUBLIC: "11.0.1" },
    };

    // @ts-ignore
    vi.mocked(gasClient.ping).mockResolvedValue(mockPingResponse);

    const { apiStatus, pingData, checkApiStatus } = useApiState();

    await checkApiStatus();

    expect(apiStatus.value).toBe("online");
    expect(pingData.value).toMatchObject({
      version: "11.0.1",
      status: "online",
    });
    expect(pingData.value?.latency).toBeDefined();
  });

  it("sets status to stale when ping returns non-online status on first attempt", async () => {
    const mockPingResponse = {
      status: "error",
      version: "11.0.1",
      modules: {},
    };

    // @ts-ignore
    vi.mocked(gasClient.ping).mockResolvedValue(mockPingResponse);

    const { apiStatus, checkApiStatus } = useApiState();

    await checkApiStatus();

    // With new soft-fail, single failure transitions to 'stale' to trigger retry
    expect(apiStatus.value).toBe("stale");
  });

  it("sets status to offline only after consecutive failures (Soft Fail)", async () => {
    vi.useFakeTimers();
    // @ts-ignore
    vi.mocked(gasClient.ping).mockRejectedValue(new Error("Network Error"));

    const { apiStatus, checkApiStatus } = useApiState();

    // First Check (Fail 1)
    await checkApiStatus();
    expect(apiStatus.value).toBe("stale");

    // Advance for retry #1 (2s delay)
    // Fail 2
    await vi.advanceTimersByTimeAsync(2100);
    expect(apiStatus.value).toBe("stale");

    // Advance for retry #2 (4s delay)
    // Fail 3
    await vi.advanceTimersByTimeAsync(4100);
    expect(apiStatus.value).toBe("stale");

    // Advance for retry #3 (6s delay)
    // Fail 4
    await vi.advanceTimersByTimeAsync(6100);
    expect(apiStatus.value).toBe("stale");

    // Advance for retry #4 (8s delay)
    // Fail 5 -> Should hit threshold (>=5 failures)
    await vi.advanceTimersByTimeAsync(8100);
    
    // After Fail 5, it finally gives up and goes 'offline'
    expect(apiStatus.value).toBe("offline");

    vi.useRealTimers();
  });
});