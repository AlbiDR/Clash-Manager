import { fetchRemote } from "@core";
import { describe, it, expect, vi, beforeEach } from "vitest";
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
vi.mock("valibot", () => ({
  object: () => ({}),
  array: () => ({}),
  unknown: () => ({}),
  number: () => ({}),
  string: () => ({}),
  optional: () => ({}),
  union: () => ({}),
  nullable: () => ({}),
  any: () => ({}),
  parse: (schema, data) => data,
  safeParse: () => ({
    success: true,
    output: { lb: [], hh: [], timestamp: 123 },
  }),
}));

// Mock IDB
vi.mock("../utils/idb", () => ({
  idb: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

describe("gasClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(
      "https://script.google.com/macros/s/TEST/exec",
    );
    // Default success response
    fetchMock.mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            success: true,
            data: { lb: [], hh: [], timestamp: 123 },
          }),
        ),
    });
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

    await fetchRemote();

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("should NOT retry on 400 errors", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400 });

    await expect(fetchRemote()).rejects.toThrow("HTTP 400");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("should fail after max retries", async () => {
    // Fail 4 times (default retry is 3, so total 4 attempts)
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(fetchRemote()).rejects.toThrow("HTTP 500");
    expect(fetchMock).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it("should detect HTML error pages", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          "<!DOCTYPE html><html><body>Google Error</body></html>",
        ),
    });

    // Updated expectation to match gasClient.ts logic
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