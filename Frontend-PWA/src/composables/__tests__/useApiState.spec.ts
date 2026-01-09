import { describe, it, expect, vi, beforeEach } from "vitest";
import { useApiState } from "../useApiState";
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

    expect(apiStatus.value).toBe("offline");
  });

  it("sets status to offline and retries on failure", async () => {
    vi.useFakeTimers();
    // @ts-ignore
    vi.mocked(gasClient.ping).mockRejectedValue(new Error("Network Error"));

    const { apiStatus, checkApiStatus } = useApiState();
    
    await checkApiStatus();

    expect(apiStatus.value).toBe("offline");
    
    // Should have a retry queued
    vi.advanceTimersByTime(2500);
    expect(gasClient.ping).toHaveBeenCalledTimes(2);
    
    vi.useRealTimers();
  });
});
