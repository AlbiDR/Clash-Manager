import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  inflatePayload,
  scanRecruitsDirect,
  subscribeToPush,
  fetchRemote,
  getPlayerProfile,
  ping,
  dismissRecruits,
  undismissRecruits,
  triggerBackendUpdate,
  isConfigured,
  getApiUrl,
  isWorkerConfigured
} from "../GasClient";

// Mock fetch global
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};
vi.stubGlobal("localStorage", localStorageMock as any);

// Mock IDB
vi.mock("../../services/StorageService", () => ({
  idb: {
    get: vi.fn(),
    set: vi.fn().mockResolvedValue(undefined),
  },
  loadCache: vi.fn(),
  saveCache: vi.fn().mockResolvedValue(undefined),
}));

describe("GasClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Stub environment variables for Vitest
    vi.stubEnv("VITE_USE_WORKER_HUB", "true");
    vi.stubEnv("VITE_WORKER_URL", "https://worker.test");
    vi.stubEnv("VITE_GAS_URL", "https://script.google.com/macros/s/G_TEST/exec");

    localStorageMock.getItem.mockImplementation((key) => {
      if (key === "cm_worker_url") return "https://worker.test";
      if (key === "cm_gas_url") return "https://script.google.com/macros/s/G_TEST/exec";
      return null;
    });

    // Default success response for GAS (used by fallback)
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, data: { format: "matrix", timestamp: 123, lb: [], hh: [] } }),
      text: () => Promise.resolve(JSON.stringify({
        success: true,
        data: {
          format: "matrix",
          timestamp: 123456789,
          lb: [],
          hh: []
        }
      }))
    });
  });

  describe("Data Inflation", () => {
    it("correctly inflates Leaderboard matrix", async () => {
      const rawMatrixData = {
        format: "matrix",
        schema: {
          lb: [
            "id", "n", "role", "t", "days", "req", "avg", "tot", "seen", "rate", "wfame", "hist", "performanceRawScore", "performanceScore", "dt", "war",
          ],
          hh: ["id", "n", "t", "potentialScore", "don", "war", "ago", "cards"],
        },
        lb: [
          [
            "player1", "King Arthur", "leader", 5000, 100, 500, 50, 1000, "2023-01-01", "100%", 1500, "3000 24W01", 52102, 100, 5, 20,
          ],
        ],
        hh: [],
        timestamp: 123456789,
      };

      const result = await inflatePayload(rawMatrixData);

      expect(result.lb[0].id).toBe("player1");
      expect(result.lb[0].n).toBe("King Arthur");
      expect(result.lb[0].t).toBe(5000);
      expect(result.lb[0].performanceScore).toBe(100);
      expect(result.lb[0].performanceRawScore).toBe(52102);
      expect(result.lb[0].dt).toBe(5);
      expect(result.lb[0].d.role).toBe("leader");
      expect(result.lb[0].d.days).toBe(100);
      expect(result.lb[0].d.avg).toBe(50);
      expect(result.lb[0].d.seen).toBe("2023-01-01");
      expect(result.lb[0].d.wfame).toBe(1500);
    });

    it("extracts playerTag from payload", async () => {
      const rawMatrixData = {
        format: "matrix",
        schema: { lb: [], hh: [] },
        lb: [],
        hh: [],
        playerTag: "player1",
        timestamp: 123456789,
      };

      const result = await inflatePayload(rawMatrixData);
      expect(result.playerTag).toBe("player1");
    });

    it("correctly inflates Headhunter matrix", async () => {
      const rawMatrixData = {
        format: "matrix",
        schema: { lb: [], hh: [] },
        lb: [],
        // [id, n, t, potentialScore, potentialRawScore, don, war, cards, ago]
        hh: [["recruit1", "New Guy", 3000, 60, 42000, 500, 20, 1000, "2024-01-01"]],
        timestamp: 123456789,
      };

      const result = await inflatePayload(rawMatrixData);

      expect(result.hh).toHaveLength(1);
      expect(result.hh[0].id).toBe("recruit1");
      expect(result.hh[0].n).toBe("New Guy");
      expect(result.hh[0].potentialScore).toBe(60);
      expect(result.hh[0].potentialRawScore).toBe(42000);
      expect(result.hh[0].d.don).toBe(500);
      expect(result.hh[0].d.war).toBe(20);
      expect(result.hh[0].d.cards).toBe(1000);
    });

    it("handles empty matrix gracefully", async () => {
      const rawMatrixData = {
        format: "matrix",
        schema: { lb: [], hh: [] },
        lb: [],
        hh: [],
        timestamp: 123456789,
      };

      const result = await inflatePayload(rawMatrixData);
      expect(result.lb).toEqual([]);
      expect(result.hh).toEqual([]);
    });

    it("handles malformed string inputs", async () => {
      const rawMatrixData = {
        format: "matrix",
        schema: { lb: [], hh: [] },
        lb: [["p1", "Test", "m", 0, 0, 0, 0, 0, "", "", 0, "", 0, 0, 0, 0]],
        hh: [],
        timestamp: 123456789,
      };

      const stringified = JSON.stringify(rawMatrixData);
      const result = await inflatePayload(stringified);
      expect(result.lb).toHaveLength(1);
      expect(result.lb[0].id).toBe("p1");
    });

    it("handles backwards compatibility for older cached data (Restored)", async () => {
      const oldMatrixData = {
        format: "matrix",
        schema: {
          lb: [
            "id", "n", "role", "t", "days", "req", "avg", "tot", "seen", "rate", "wfame", "hist", "r", "s", "dt", "war"
          ],
          hh: []
        },
        lb: [
          ["p1", "OldGuy", "m", 5000, 100, 0, 0, 0, "", "", 0, "", 50000, 95, 0, 0]
        ],
        hh: [],
        timestamp: 123
      };

      const result = await inflatePayload(oldMatrixData);
      // Should map 'r' -> performanceRawScore, 's' -> performanceScore
      expect(result.lb[0].performanceRawScore).toBe(50000);
      expect(result.lb[0].performanceScore).toBe(95);
    });
  });

  describe("Worker Operations", () => {
    describe("scanRecruitsDirect", () => {
      it("successfully scans and maps recruits (Happy Path)", async () => {
        const mockResponse = {
          candidates: [
            {
              tag: "#2CCCP",
              name: "Player 1",
              trophies: 6000,
              rawScore: 25000,
              donations: 500,
              war: 10,
              cards: 103,
            },
          ],
        };

        fetchMock.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const result = await scanRecruitsDirect();

        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining("/public/scan"),
          expect.objectContaining({ method: "POST" })
        );
        expect(result).toHaveLength(1);
        expect(result![0].id).toBe("2CCCP");
        expect(result![0].n).toBe("Player 1");
        expect(result![0].potentialScore).toBe(50); // (25000/50000) * 100
      });

      it("returns null on validation failure", async () => {
        fetchMock.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ candidates: [{ trophies: 6000 }] }),
        });

        const result = await scanRecruitsDirect();
        expect(result).toBeNull();
      });

      it("returns null on network failure", async () => {
        fetchMock.mockResolvedValue({
          ok: false,
          status: 500,
        });

        const result = await scanRecruitsDirect();
        expect(result).toBeNull();
      });

      it("returns null if worker URL is not configured", async () => {
        localStorageMock.getItem.mockImplementation((key) => {
          if (key === "cm_worker_url") return null;
          return "https://script.google.com/macros/s/G_TEST/exec";
        });

        const result = await scanRecruitsDirect();
        expect(result).toBeNull();
      });
    });

    describe("subscribeToPush", () => {
      const mockSubscription = {} as PushSubscription;

      it("returns true on successful subscription", async () => {
        fetchMock.mockResolvedValue({ ok: true });

        const result = await subscribeToPush(mockSubscription);
        expect(result).toBe(true);
      });

      it("returns false on fetch failure", async () => {
        fetchMock.mockRejectedValue(new Error("Network Error"));

        const result = await subscribeToPush(mockSubscription);
        expect(result).toBe(false);
      });
    });
  });

  describe("fetchRemote", () => {
    const mockHubState = {
      success: true,
      data: {
        metadata: {
          timestamp: "2026-03-23T12:00:00Z",
          status: "healthy",
          version: "v1_hub",
          source: "RENDER_WORKER"
        },
        data: {
          roster: [
            ["id", "n", "role", "t", "performanceScore", "performanceRawScore", "days", "req", "avg", "tot", "seen", "rate", "wfame", "hist", "dt", "war"],
            ["W1", "Worker Player", "elder", 6500, 95, 55000, 200, 0, 100, 0, "today", "100%", 2000, "hist", 10, 30]
          ],
          headhunter: [
            ["id", "n", "t", "potentialScore", "potentialRawScore", "don", "war", "cards", "ago", "lastScan"],
            ["R1", "Worker Recruit", 3000, 70, 35000, 100, 5, 50, "1d", 12345678]
          ]
        }
      }
    };

    it("successfully fetches from Worker Hub", async () => {
      fetchMock.mockImplementation((url) => {
        if (typeof url === "string" && url.includes("/hub/state")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(mockHubState)
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({ success: true, data: { format: "matrix", timestamp: 123, lb: [], hh: [] } }))
        });
      });

      const result = await fetchRemote();

      expect(fetchMock).toHaveBeenCalledWith(
        "https://worker.test/hub/state",
        expect.objectContaining({ method: "GET" })
      );
      expect(result.dataSource).toBe("WORKER");
      expect(result.lb[0].n).toBe("Worker Player");
    });

    it("falls back to GAS on Worker Hub HTTP error", async () => {
      fetchMock
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: { format: "matrix", timestamp: 123, lb: [], hh: [] } }),
          text: () => Promise.resolve(JSON.stringify({ success: true, data: { format: "matrix", timestamp: 123, lb: [], hh: [] } }))
        });

      const result = await fetchRemote();

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.dataSource).toBe("GAS");
    });

    it("falls back to GAS on Worker Hub malformed payload", async () => {
      fetchMock
        .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data: null }) })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: { format: "matrix", timestamp: 123, lb: [], hh: [] } }),
          text: () => Promise.resolve(JSON.stringify({ success: true, data: { format: "matrix", timestamp: 123, lb: [], hh: [] } }))
        });

      const result = await fetchRemote();

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.dataSource).toBe("GAS");
    });

    it("honors AbortSignal and does NOT fall back to GAS", async () => {
      const controller = new AbortController();

      fetchMock.mockImplementation((url, options) => {
        if (options?.signal?.aborted) {
          return Promise.reject(new DOMException("Aborted", "AbortError"));
        }
        return new Promise((resolve, reject) => {
           options.signal?.addEventListener("abort", () => {
             reject(new DOMException("Aborted", "AbortError"));
           });
        });
      });

      const promise = fetchRemote({ signal: controller.signal });

      // Abort
      controller.abort();

      await expect(promise).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("handles Worker Hub timeout and falls back to GAS", async () => {
      vi.useFakeTimers();

      fetchMock.mockImplementation((url, options) => {
        if (typeof url === "string" && url.includes("/hub/state")) {
           return new Promise((resolve, reject) => {
             options.signal?.addEventListener("abort", () => {
               reject(new DOMException("Timeout", "AbortError"));
             });
           });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: { format: "matrix", timestamp: 123, lb: [], hh: [] } }),
          text: () => Promise.resolve(JSON.stringify({ success: true, data: { format: "matrix", timestamp: 123, lb: [], hh: [] } }))
        });
      });

      const fetchPromise = fetchRemote();

      // Trigger timeout (3s in code)
      await vi.advanceTimersByTimeAsync(4000);

      const result = await fetchPromise;

      expect(result.dataSource).toBe("GAS");
      expect(fetchMock).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });
  });

  describe("getPlayerProfile", () => {
    it("successfully retrieves and validates internal player profile", async () => {
      const mockProfile = {
        profile: {
          name: "Test Player",
          tag: "TAG1",
          kingLevel: 14,
          xpIntoLevel: 1000,
        },
        cards: [],
        inventory: { gold: 100 }
      };

      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: mockProfile }),
        text: () => Promise.resolve(JSON.stringify({
          success: true,
          data: mockProfile
        }))
      });

      const result = await getPlayerProfile("TAG1");

      expect(result).toHaveProperty("profile");
    });

    it("throws on validation failure", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: "not-an-object" }),
        text: () => Promise.resolve(JSON.stringify({
          success: true,
          data: "not-an-object"
        }))
      });

      await expect(getPlayerProfile("TAG1")).rejects.toThrow();
    });
  });

  describe("Utility GAS Methods", () => {
    it("ping returns script metadata", async () => {
      const mockPing = { version: "1.0", status: "ok", modules: {} };
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ success: true, data: mockPing }))
      });

      const result = await ping();
      expect(result).toEqual(mockPing);
    });

    it("dismissRecruits sends correct payload", async () => {
      const mockApiResponse = {
        status: "success",
        data: { success: true, count: 1 },
        error: null,
        timestamp: "2026-03-23"
      };

      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ success: true, data: mockApiResponse }))
      });

      const items = [{ id: "TAG1", score: 90 }];
      const result = await dismissRecruits(items);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("action=dismissRecruits"),
        expect.objectContaining({
          body: expect.stringContaining('"items":[{"id":"TAG1","score":90}]')
        })
      );
      expect(result.data?.success).toBe(true);
    });

    it("undismissRecruits sends correct payload", async () => {
      const mockApiResponse = {
        status: "success",
        data: { success: true },
        error: null,
        timestamp: "2026-03-23"
      };

      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ success: true, data: mockApiResponse }))
      });

      const result = await undismissRecruits(["TAG1"]);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("action=undismissRecruits"),
        expect.objectContaining({
          body: expect.stringContaining('"ids":["TAG1"]')
        })
      );
    });

    it("triggerBackendUpdate sends correct payload", async () => {
      const mockApiResponse = {
        status: "success",
        data: { success: true, message: "OK" },
        error: null,
        timestamp: "2026-03-23"
      };

      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ success: true, data: mockApiResponse }))
      });

      const result = await triggerBackendUpdate("all");
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("action=triggerUpdate"),
        expect.objectContaining({
          body: expect.stringContaining('"target":"all"')
        })
      );
    });
  });

  describe("Configuration Helpers", () => {
    it("isConfigured checks for GAS URL", () => {
      localStorageMock.getItem.mockReturnValue("https://some-url");
      expect(isConfigured()).toBe(true);

      localStorageMock.getItem.mockReturnValue(null);
      vi.stubEnv("VITE_GAS_URL", "");
      expect(isConfigured()).toBe(false);
    });

    it("getApiUrl returns resolved URL", () => {
      localStorageMock.getItem.mockReturnValue("https://some-url");
      expect(getApiUrl()).toBe("https://some-url");
    });

    it("isWorkerConfigured checks for Worker URL", () => {
      localStorageMock.getItem.mockReturnValue("https://worker-url");
      expect(isWorkerConfigured()).toBe(true);

      localStorageMock.getItem.mockReturnValue(null);
      vi.stubEnv("VITE_WORKER_URL", "");
      expect(isWorkerConfigured()).toBe(false);
    });
  });
});
