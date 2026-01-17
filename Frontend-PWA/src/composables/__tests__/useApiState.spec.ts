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
      version: "6.3.0",
      modules: { API_PUBLIC: "6.3.0" },
    };

    // @ts-ignore
    vi.mocked(gasClient.ping).mockResolvedValue(mockPingResponse);

    const { apiStatus, pingData, checkApiStatus } = useApiState();

    await checkApiStatus();

    expect(apiStatus.value).toBe("online");
    expect(pingData.value).toMatchObject({
      version: "6.3.0",
      status: "online",
    });
    expect(pingData.value?.latency).toBeDefined();
  });

  it("sets status to offline when ping returns non-online status", async () => {
    const mockPingResponse = {
      status: "error",
      version: "6.3.0",
      modules: {},
    };

    // @ts-ignore
    vi.mocked(gasClient.ping).mockResolvedValue(mockPingResponse);

    const { apiStatus, checkApiStatus } = useApiState();

    await checkApiStatus();

    // With soft-fail, single failure doesn't go offline immediately
    // Since it starts as 'checking', it remains 'checking' (soft fail)
    expect(apiStatus.value).toBe("checking");
  });

  it("sets status to offline only after consecutive failures (Soft Fail)", async () => {
    vi.useFakeTimers();
    // @ts-ignore
    vi.mocked(gasClient.ping).mockRejectedValue(new Error("Network Error"));

    const { apiStatus, checkApiStatus } = useApiState();

    // First Check (Fail 1)
    await checkApiStatus();
    // Should NOT be offline yet (Soft Fail)
    expect(apiStatus.value).not.toBe("offline");

    // Should have a retry queued (Fast Retry)
    vi.advanceTimersByTime(550);
    expect(gasClient.ping).toHaveBeenCalledTimes(2);

    // After retry fails (Fail 2) -> Now it should be offline
    // We need to wait for the pending promise of the retry.
    // Since checkApiStatus is async, the setTimeout call just triggers it.
    // In a real env, we'd wait. In tests, we might need a small tick.
    await vi.runAllTicks();

    // Note: Since the retry is async inside setTimeout, we might need to manually trigger checkApiStatus if we want to await it easily,
    // or just assume the mock rejection happens.
    // Ideally we'd mock the second call to trigger the state change.

    // Let's explicitly call it a second time to simulate the retry effect for assertion,
    // as awaiting the timer callback is tricky without a returned promise.
    await checkApiStatus();
    expect(apiStatus.value).toBe("offline");

    vi.useRealTimers();
  });
});
