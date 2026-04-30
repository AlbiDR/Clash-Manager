import { resetApiState, useApiState } from "../useApiState";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isConfigured, ping, getApiUrl } from "../SupabaseClient";
import { nextTick } from "vue";

// Mock SupabaseClient directly using deep import path to avoid singleton/barrel issues
vi.mock("../SupabaseClient", () => ({
  isConfigured: vi.fn(),
  ping: vi.fn(),
  getApiUrl: vi.fn(),
  lastHubDiagnosis: { value: null },
  lastSyncStatus: { value: null },
}));

describe("useApiState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    resetApiState();

    // Set default mock behaviors
    vi.mocked(isConfigured).mockReturnValue(true);
    vi.mocked(ping).mockResolvedValue({ status: "success", version: "1.0", modules: {} });
    vi.mocked(getApiUrl).mockReturnValue("https://mock-gas-url.com");
    vi.stubGlobal("navigator", { onLine: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("sets status to online when ping succeeds with status 'success'", async () => {
    const mockPingResponse = {
      status: "success",
      version: "11.0.1",
      modules: { API_PUBLIC: "11.0.1" },
    };

    // @ts-ignore
    vi.mocked(ping).mockResolvedValue(mockPingResponse);

    const { apiStatus, pingData, checkApiStatus } = useApiState();

    await checkApiStatus();

    expect(apiStatus.value).toBe("online");
    expect(pingData.value).toMatchObject({
      version: "11.0.1",
      status: "success",
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
    vi.mocked(ping).mockResolvedValue(mockPingResponse);

    const { apiStatus, checkApiStatus } = useApiState();

    await checkApiStatus();

    // With new soft-fail, single failure transitions to 'stale' to trigger retry
    expect(apiStatus.value).toBe("stale");
  });

  it("sets status to offline only after consecutive failures (Soft Fail)", async () => {
    // @ts-ignore
    vi.mocked(ping).mockRejectedValue(new Error("Network Error"));

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
  });

  it("sets status to unconfigured when isConfigured returns false", async () => {
    // @ts-ignore
    vi.mocked(isConfigured).mockReturnValue(false);

    const { apiStatus, checkApiStatus } = useApiState();

    await checkApiStatus();

    expect(apiStatus.value).toBe("unconfigured");
  });

  it("init() bootstraps the status check only once", async () => {
    const { init } = useApiState();

    init();
    init();

    // checkApiStatus is internal, but it calls ping
    // Note: We expect 1 here. If it was already called by another test, resetApiState() in beforeEach should handle it.
    expect(ping).toHaveBeenCalledTimes(1);
  });



  it("sets status to offline immediately when navigator.onLine is false", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    // @ts-ignore
    vi.mocked(ping).mockRejectedValue(new Error("Network Error"));

    const { apiStatus, checkApiStatus } = useApiState();

    await checkApiStatus();

    expect(apiStatus.value).toBe("offline");
  });

  it("sets status to waking during retries", async () => {
    // @ts-ignore
    vi.mocked(ping).mockRejectedValue(new Error("Network Error"));

    const { apiStatus, checkApiStatus } = useApiState();

    // First Check (Fail 1) -> transitions to 'stale'
    await checkApiStatus();
    expect(apiStatus.value).toBe("stale");

    // Mock ping to be slow and check status during next attempt
    vi.mocked(ping).mockImplementation(() => {
        expect(apiStatus.value).toBe("waking");
        return Promise.reject(new Error("Network Error"));
    });

    // Advance to next retry
    await vi.advanceTimersByTimeAsync(2100);
  });

  it("handshake times out after 25 seconds", async () => {
    // ping never resolves
    // @ts-ignore
    vi.mocked(ping).mockImplementation(() => new Promise(() => {}));

    const { apiStatus, checkApiStatus } = useApiState();

    const checkPromise = checkApiStatus();

    // Advance 25s to trigger timeout
    await vi.advanceTimersByTimeAsync(25001);
    await checkPromise;

    // Timeout should trigger handleFailure -> stale
    expect(apiStatus.value).toBe("stale");
  });

  it("cancels and replaces pending handshake when checkApiStatus is called twice", async () => {
    // Reset call count and state for this test
    resetApiState();
    vi.mocked(ping).mockClear();

    // Mock ping: first one hangs/aborts, second one resolves immediately
    vi.mocked(ping)
      .mockImplementationOnce(({ signal }) => {
        return new Promise((resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          }, { once: true });
        });
      })
      .mockResolvedValueOnce({ status: "success", version: "1.0", modules: {} });

    const { checkApiStatus } = useApiState();

    // First call - will hang
    const promise1 = checkApiStatus();
    // Immediate second call - should abort the first one and then resolve
    const promise2 = checkApiStatus();

    await Promise.all([promise1, promise2]);

    // Should be called exactly twice
    expect(ping).toHaveBeenCalledTimes(2);
  });
});