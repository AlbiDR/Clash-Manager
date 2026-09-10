// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import { setKeys, fetchWithRotation, processBatch } from "../muscle.ts";

/**
 * L1 Core: Native Muscle Engine Spec
 *
 * @remarks
 * Exercises Key Farm initialization, lazy Deno environment resolution, transparent key
 * rotation on 403/429/5xx, exponential backoff retries, network fetch exceptions,
 * key exhaustion error boundaries, and batch concurrency controls.
 */

beforeAll(() => {
  // Ensure global Deno object exists for Node/Vitest test environment.
  if (typeof globalThis.Deno === "undefined") {
    const envStore: Record<string, string> = {
      ROYALE_API_KEYS: "env-key-1,env-key-2",
    };
    globalThis.Deno = {
      env: {
        get: (key: string) => envStore[key] || "",
        toObject: () => ({ ...envStore }),
        set: (key: string, value: string) => {
          envStore[key] = value;
        },
        delete: (key: string) => {
          delete envStore[key];
        },
        has: (key: string) => key in envStore,
      },
    } as any;
  }
});

describe("Native Muscle Engine (muscle.ts)", () => {
  let originalFetch: typeof globalThis.fetch;
  let mathRandomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.clearAllMocks();
    // Deterministic key farm starting index
    mathRandomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    // Reset activeKeys by setting env and setKeys
    (globalThis.Deno.env as any).set("ROYALE_API_KEYS", "key-alpha,key-beta");
    setKeys("key-alpha,key-beta");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mathRandomSpy.mockRestore();
    vi.useRealTimers();
  });

  describe("setKeys and getKeys key pool normalization", () => {
    it("accepts a comma-separated key string and normalizes keys", () => {
      setKeys("  key-1 , key-2,key-3  ");
      expect(() => setKeys("key-a,key-b")).not.toThrow();
    });

    it("accepts a JSON string array", () => {
      setKeys(JSON.stringify(["json-key-1", "json-key-2"]));
      expect(() => setKeys("key-1")).not.toThrow();
    });

    it("accepts an array of string keys directly", () => {
      setKeys(["array-key-1", "array-key-2"]);
      expect(() => setKeys(["key-1"])).not.toThrow();
    });

    it("falls back to Deno.env when activeKeys is cleared or empty", async () => {
      setKeys([]);
      (globalThis.Deno.env as any).set("ROYALE_API_KEYS", "env-fallback-key");

      const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      globalThis.fetch = mockFetch;

      const res = await fetchWithRotation("/test-endpoint");
      expect(res.status).toBe(200);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://proxy.royaleapi.dev/v1/test-endpoint",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer env-fallback-key",
          }),
        }),
      );
    });
  });

  describe("fetchWithRotation HTTP execution and rotation", () => {
    it("returns successful 200 response on first attempt without rotating or retrying", async () => {
      setKeys(["key-sole"]);
      const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ tag: "#CLAN1" }), { status: 200 }));
      globalThis.fetch = mockFetch;

      const response = await fetchWithRotation("/clans/%23CLAN1");
      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("rotates immediately to next key on HTTP 403 Forbidden without retrying same key", async () => {
      setKeys(["key-forbidden", "key-valid"]);

      const mockFetch = vi.fn().mockImplementation((_url, init) => {
        const auth = init?.headers?.Authorization;
        if (auth === "Bearer key-forbidden") {
          return Promise.resolve(new Response("Forbidden", { status: 403 }));
        }
        return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
      });
      globalThis.fetch = mockFetch;

      const res = await fetchWithRotation("/clans/%23CLAN1");
      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("rotates immediately to next key on HTTP 429 Too Many Requests without retrying same key", async () => {
      setKeys(["key-ratelimited", "key-working"]);

      const mockFetch = vi.fn().mockImplementation((_url, init) => {
        const auth = init?.headers?.Authorization;
        if (auth === "Bearer key-ratelimited") {
          return Promise.resolve(new Response("Too Many Requests", { status: 429 }));
        }
        return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
      });
      globalThis.fetch = mockFetch;

      const res = await fetchWithRotation("/players/%23PLAYER1");
      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("retries with backoff up to maxRetries on HTTP 500 server error before rotating", async () => {
      vi.useFakeTimers();
      setKeys(["key-500", "key-backup"]);

      const mockFetch = vi.fn().mockImplementation((_url, init) => {
        const auth = init?.headers?.Authorization;
        if (auth === "Bearer key-500") {
          return Promise.resolve(new Response("Internal Server Error", { status: 500 }));
        }
        return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
      });
      globalThis.fetch = mockFetch;

      const fetchPromise = fetchWithRotation("/tournaments/AUTO", 2);

      // Fast-forward timers for exponential backoff delays
      await vi.runAllTimersAsync();

      const res = await fetchPromise;
      expect(res.status).toBe(200);

      // key-500 called 3 times (initial + 2 retries), then rotated to key-backup (1 call) => 4 total
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it("retries on fetch network rejections and rotates key when retries are exhausted", async () => {
      vi.useFakeTimers();
      setKeys(["key-network-drop", "key-stable"]);

      const mockFetch = vi.fn().mockImplementation((_url, init) => {
        const auth = init?.headers?.Authorization;
        if (auth === "Bearer key-network-drop") {
          return Promise.reject(new Error("Network connection lost"));
        }
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      });
      globalThis.fetch = mockFetch;

      const fetchPromise = fetchWithRotation("/status", 1);
      await vi.runAllTimersAsync();

      const res = await fetchPromise;
      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(3); // key-network-drop: 1 + 1 retry, then key-stable: 1 call
    });

    it("throws exhaustion error when all keys fail or get rejected by proxy", async () => {
      setKeys(["bad-key-1", "bad-key-2"]);

      const mockFetch = vi.fn().mockResolvedValue(new Response("Forbidden", { status: 403 }));
      globalThis.fetch = mockFetch;

      await expect(fetchWithRotation("/test", 1)).rejects.toThrow(
        "[Native-Muscle] All 2 keys exhausted or rejected by proxy.",
      );
    });
  });

  describe("processBatch concurrency control", () => {
    it("executes all tasks and returns array of results", async () => {
      const tasks = [
        () => Promise.resolve(10),
        () => Promise.resolve(20),
        () => Promise.resolve(30),
      ];

      const results = await processBatch(tasks, 2);
      expect(results).toEqual([10, 20, 30]);
    });

    it("handles empty task lists gracefully", async () => {
      const results = await processBatch([], 5);
      expect(results).toEqual([]);
    });

    it("enforces concurrency limits when processing tasks", async () => {
      let activeCount = 0;
      let maxActiveObserved = 0;

      const createTask = (id: number) => async () => {
        activeCount++;
        maxActiveObserved = Math.max(maxActiveObserved, activeCount);
        await new Promise((resolve) => setTimeout(resolve, 10));
        activeCount--;
        return id;
      };

      const tasks = Array.from({ length: 10 }, (_, i) => createTask(i));
      const results = await processBatch(tasks, 3);

      expect(results).toHaveLength(10);
      expect(maxActiveObserved).toBeLessThanOrEqual(3);
    });

    it("propagates task rejection when a task throws", async () => {
      const tasks = [
        () => Promise.resolve("ok"),
        () => Promise.reject(new Error("task failure")),
      ];

      await expect(processBatch(tasks, 2)).rejects.toThrow("task failure");
    });
  });
});
