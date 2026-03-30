import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { fetchRemote, _setWorkerHubTestOverride } from "../GasClient";

// Mock fetch global
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  clear: vi.fn(),
};
vi.stubGlobal("localStorage", localStorageMock);

// Mock Valibot (since inflatePayload uses it dynamically)
vi.mock("valibot", async (importOriginal) => {
  const actual = await importOriginal<typeof import("valibot")>();
  return {
    ...actual,
    parse: (schema: any, data: any) => data,
    safeParse: (schema: any, data: any) => {
       if (data && typeof data === 'object' && 'lb' in data) {
          return {
            success: true,
            output: { lb: [], hh: [], timestamp: 123 },
          };
       }
       return {
          success: true,
          output: data
       };
    },
  };
});

// Mock StorageService
vi.mock("../services/StorageService", () => ({
  idb: {
    get: vi.fn(),
    set: vi.fn().mockResolvedValue(undefined),
  },
  loadCache: vi.fn(),
  saveCache: vi.fn().mockResolvedValue(undefined),
}));

describe("gasClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // ISOLATION: Stub import.meta.env so the GAS_URL guard does not fire.
    // vi.mock("import.meta.env") is invalid — import.meta.env is a Vite
    // compile-time global, not a resolvable module. vi.stubEnv is the
    // correct Vitest API for patching it at runtime.
    vi.stubEnv("VITE_GAS_URL", "https://script.google.com/macros/s/TEST/exec");
    vi.stubEnv("VITE_USE_WORKER_HUB", "false");

    // ISOLATION: Explicitly disable the Worker Hub for all legacy retry tests
    // to prevent Hub fetch attempts from polluting call counts and timing.
    _setWorkerHubTestOverride(false);

    // Default successful fetch
    fetchMock.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ 
        success: true, 
        data: { lb: [], hh: [], timestamp: 123 } 
      })),
      json: () => Promise.resolve({ success: true, data: { lb: [], hh: [], timestamp: 123 } }),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("should retry on 500 errors", async () => {
    // Fail twice with 500, then succeed
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              success: true,
              data: { lb: [], hh: [], timestamp: 123 },
            }),
          ),
      });

    const promise = fetchRemote();
    
    // Process retries
    await vi.runAllTimersAsync();
    
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("should NOT retry on 400 errors", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400 });

    await expect(fetchRemote()).rejects.toThrow("Server returned HTTP 400");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("should fail after max retries", async () => {
    // Fail 5 times (1 initial + 4 retries)
    fetchMock.mockResolvedValue({ ok: false, status: 505 });

    let caughtError: Error | undefined;
    const promise = fetchRemote().catch((error) => { caughtError = error; });
    
    // Process all retries
    await vi.runAllTimersAsync();
    await promise;
    
    expect(caughtError).toBeDefined();
    expect(caughtError?.message).toContain("HTTP 505");

    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("should detect HTML error pages", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          "<!DOCTYPE html><html><body>Google Error</body></html>",
        ),
    });

    await expect(fetchRemote()).rejects.toThrow("Backend Configuration Error (HTML Response)");
  });

  it("should handle malformed JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('{"incomplete": true'),
    });

    await expect(fetchRemote()).rejects.toThrow("Malformed JSON Response from Backend");
  });
});