import { describe, it, expect, vi, beforeEach } from "vitest";
import { useApiState, resetApiState } from "../useApiState";
import * as gasClient from "../../api/gasClient";

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

    // Advance for first retry (2s)
    vi.advanceTimersByTime(2100);
    // After Fail 2, it stays 'stale' and schedules another check
    expect(apiStatus.value).toBe("stale");

    // Advance for second retry (4s)
    vi.advanceTimersByTime(4100);
    // After Fail 3, it finally gives up and goes 'offline'
    expect(apiStatus.value).toBe("offline");

    vi.useRealTimers();
  });
});
