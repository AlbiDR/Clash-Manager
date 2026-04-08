// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// 1. Hoist all mocks to ensure they are applied before module loading
vi.mock("../../services/StorageService", () => ({
  idb: {
    get: vi.fn(),
    set: vi.fn().mockResolvedValue(undefined),
  }
}));

const envMock = vi.hoisted(() => ({
  VITE_USE_WORKER_HUB: "true",
  VITE_GAS_URL: "https://script.google.com/macros/s/123/exec",
  VITE_WORKER_URL: "https://worker.test",
  VITE_WORKER_TOKEN: "test-token"
}));
vi.mock("import.meta.env", () => envMock);

import * as GasClient from "../GasClient";

describe("GasClient", () => {
  let fetchSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    localStorage.clear();
    localStorage.setItem("cm_gas_url", "https://script.google.com/macros/s/123/exec");
    localStorage.setItem("cm_worker_url", "https://worker.test");

    // Inject into import.meta.env for modules already loaded
    try {
      Object.assign(import.meta.env, envMock);
    } catch (e) {}

    fetchSpy = vi.spyOn(global, "fetch");
    // Suppress console.error/warn to keep test output clean during expected failures
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("Payload Inflation", () => {
    it("correctly inflates Leaderboard matrix", async () => {
      const payload = {
        format: "matrix",
        timestamp: 123456789,
        schema: {
          lb: ["id", "n", "role", "t", "performanceScore", "performanceRawScore", "days", "req", "avg", "tot", "seen", "rate", "wfame", "hist", "dt", "war"],
          hh: []
        },
        lb: [["T1", "Name1", "leader", 6000, 90, 50000, 100, 0, 50, 0, "today", "100%", 1000, "hist", 5, 20]],
        hh: []
      };

      const result = await GasClient.inflatePayload(payload);
      expect(result.lb).toHaveLength(1);
      expect(result.lb[0].id).toBe("T1");
      expect(result.lb[0].n).toBe("Name1");
      expect(result.lb[0].d.role).toBe("leader");
    });

    it("extracts playerTag from payload", async () => {
       const payload = {
          format: "matrix",
          timestamp: 123456789,
          playerTag: "ABC",
          lb: [],
          hh: []
       };
       const result = await GasClient.inflatePayload(payload);
       expect(result.playerTag).toBe("ABC");
    });

    it("correctly inflates Headhunter matrix", async () => {
      const payload = {
        format: "matrix",
        timestamp: 123456789,
        schema: {
          lb: [],
          hh: ["id", "n", "t", "potentialScore", "potentialRawScore", "don", "war", "cards", "ago", "lastScan"]
        },
        lb: [],
        hh: [["R1", "Recruit1", 5000, 80, 40000, 100, 10, 50, "1d", 12345678]]
      };

      const result = await GasClient.inflatePayload(payload);
      expect(result.hh).toHaveLength(1);
      expect(result.hh[0].id).toBe("R1");
      expect(result.hh[0].n).toBe("Recruit1");
      expect(result.hh[0].t).toBe(5000);
      expect(result.hh[0].d.don).toBe(100);
    });

    it("handles backwards compatibility for older cached data (Restored)", async () => {
       const legacy = {
          lb: [{
            id: "T1", n: "N1", t: 6000, performanceScore: 90, performanceRawScore: 50000,
            d: { role: "leader", days: 100, avg: 50, seen: "today", rate: "100%", wfame: 1000, hist: "hist" }
          }],
          hh: [],
          timestamp: 123456789
       };
       const result = await GasClient.inflatePayload(legacy);
       expect(result.lb[0].id).toBe("T1");
    });

    it("throws error for null or non-object payloads", async () => {
      await expect(GasClient.inflatePayload(null)).rejects.toThrow("Invalid payload");
      await expect(GasClient.inflatePayload(undefined)).rejects.toThrow("Invalid payload");
      await expect(GasClient.inflatePayload(123)).rejects.toThrow("Invalid payload");
    });

    it("throws error when non-matrix payload fails validation", async () => {
      const invalidLegacy = {
        lb: "not-an-array",
        hh: [],
        timestamp: 123456789
      };
      await expect(GasClient.inflatePayload(invalidLegacy)).rejects.toThrow();
    });

    it("throws error when matrix payload fails validation", async () => {
      const invalidMatrix = {
        format: "matrix",
        lb: "not-an-array",
        hh: [],
        timestamp: 123456789
      };
      await expect(GasClient.inflatePayload(invalidMatrix)).rejects.toThrow();
    });
  });

  describe("Worker Operations", () => {
    it("successfully scans and maps recruits (Happy Path)", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{
            tag: "#2CCCP",
            name: "Test Player",
            trophies: 6000,
            rawScore: 45000,
            donations: 500,
            war: 20,
            cards: 50
          }]
        })
      });

      const result = await GasClient.scanRecruitsDirect();
      expect(result).not.toBeNull();
      expect(result!).toHaveLength(1);
      expect(result![0].id).toBe("2CCCP");
    });

    it("returns null when worker scan fails validation", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{
            // tag is missing
            name: "Invalid Player",
            trophies: 6000
          }]
        })
      });

      const result = await GasClient.scanRecruitsDirect();
      expect(result).toBeNull();
    });

    it("returns null when workerUrl is not configured", async () => {
      localStorage.removeItem("cm_worker_url");
      vi.stubEnv("VITE_WORKER_URL", "");

      const result = await GasClient.scanRecruitsDirect();
      expect(result).toBeNull();
    });

    it("returns null when worker scan returns non-OK HTTP status", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      const result = await GasClient.scanRecruitsDirect();
      expect(result).toBeNull();
    });

    it("returns null when fetch throws a network error", async () => {
      fetchSpy.mockRejectedValueOnce(new Error("Fetch Failure"));

      const result = await GasClient.scanRecruitsDirect();
      expect(result).toBeNull();
    });

    it("returns null when worker response is malformed JSON", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error("SyntaxError: Unexpected token"))
      });

      const result = await GasClient.scanRecruitsDirect();
      expect(result).toBeNull();
    });
  });

  describe("fetchRemote", () => {
    const mockHubState = {
      success: true,
      data: {
        metadata: {
          timestamp: "2026-03-23T12:00:00Z",
          lastCompiled: "2026-03-23T12:00:00Z",
          lastFetched: "2026-03-23T12:00:00Z",
          status: "healthy",
          version: "v2_structured",
          source: "RENDER_WORKER"
        },
        data: {
          roster: [
            [false, "ROSTER TITLE"],
            ["Tag", "Name"],
            ["id", "n", "role", "t", "performanceScore", "performanceRawScore", "days", "req", "avg", "tot", "seen", "rate", "wfame", "hist", "dt", "war"],
            ["W1", "Worker Player", "elder", 6500, 95, 55000, 200, 0, 100, 0, "today", "100%", 2000, "hist", 10, 30]
          ],
          headhunter: [
            [false, "HEADHUNTER TITLE"],
            ["Tag", "Name"],
            ["id", "n", "t", "potentialScore", "potentialRawScore", "don", "war", "cards", "ago", "lastScan"],
            ["R1", "Worker Recruit", 3000, 70, 35000, 100, 5, 50, "1d", 12345678]
          ]
        }
      }
    };

    it("successfully fetches from Worker Hub", async () => {
      fetchSpy.mockImplementation(((url: string) => {
        if (url.includes("/hub/state")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(mockHubState)
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({
            success: true,
            data: { format: "matrix", timestamp: 123456789, lb: [], hh: [] }
          }))
        });
      }) as any);

      const result = await GasClient.fetchRemote();
      console.log("TEST DEBUG: dataSource =", result.dataSource);
      console.log("TEST DEBUG: lb length =", result.lb.length);
      if (result.lb[0]) console.log("TEST DEBUG: lb[0] =", JSON.stringify(result.lb[0]));

      expect(result.dataSource).toBe("WORKER");
      expect(result.lb[0].n).toBe("Worker Player");
    });

    it("falls back to GAS when Worker Hub returns HTTP error", async () => {
      vi.mocked(GasClient._setWorkerHubTestOverride)(null);
      fetchSpy.mockImplementation(((url: string) => {
        if (url.includes("/hub/state")) {
          return Promise.resolve({
            ok: false,
            status: 500
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({
            success: true,
            data: { format: "matrix", timestamp: 123456789, lb: [], hh: [] }
          }))
        });
      }) as any);

      const result = await GasClient.fetchRemote();
      expect(result.dataSource).toBe("GAS");
    });

    it("falls back to GAS when Worker Hub returns malformed payload", async () => {
      fetchSpy.mockImplementation(((url: string) => {
        if (url.includes("/hub/state")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ success: true /* data is missing */ })
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({
            success: true,
            data: { format: "matrix", timestamp: 123456789, lb: [], hh: [] }
          }))
        });
      }) as any);

      const result = await GasClient.fetchRemote();
      expect(result.dataSource).toBe("GAS");
      expect(GasClient.lastHubDiagnosis.value).toBe("VALIDATION");
    });

    it("falls back to GAS when Worker Hub data fails validation", async () => {
      const invalidHubState = {
        success: true,
        data: {
          metadata: { timestamp: "invalid" },
          data: { roster: [], headhunter: [] }
        }
      };

      fetchSpy.mockImplementation(((url: string) => {
        if (url.includes("/hub/state")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(invalidHubState)
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({
            success: true,
            data: { format: "matrix", timestamp: 123456789, lb: [], hh: [] }
          }))
        });
      }) as any);

      const result = await GasClient.fetchRemote();
      expect(result.dataSource).toBe("GAS");
      expect(GasClient.lastHubDiagnosis.value).toBe("VALIDATION");
    });

    it("sets lastHubDiagnosis to AUTH when Worker Hub returns 401/403", async () => {
      fetchSpy.mockImplementation(((url: string) => {
        if (url.includes("/hub/state")) {
          return Promise.resolve({
            ok: false,
            status: 401
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({
            success: true,
            data: { format: "matrix", timestamp: 123456789, lb: [], hh: [] }
          }))
        });
      }) as any);

      await GasClient.fetchRemote();
      expect(GasClient.lastHubDiagnosis.value).toBe("AUTH");
    });

    it("sets lastHubDiagnosis to OFFLINE on generic network error during worker fetch", async () => {
      fetchSpy.mockImplementation(((url: string) => {
        if (url.includes("/hub/state")) {
          return Promise.reject(new Error("Network Failure"));
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({
            success: true,
            data: { format: "matrix", timestamp: 123456789, lb: [], hh: [] }
          }))
        });
      }) as any);

      await GasClient.fetchRemote();
      expect(GasClient.lastHubDiagnosis.value).toBe("OFFLINE");
    });

    it("sets lastHubDiagnosis to TIMEOUT when Worker Hub fetch times out", async () => {
      fetchSpy.mockImplementation(((url: string) => {
        if (url.includes("/hub/state")) {
          const error = new Error("The operation was aborted.");
          error.name = "AbortError";
          return Promise.reject(error);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({
            success: true,
            data: { format: "matrix", timestamp: 123456789, lb: [], hh: [] }
          }))
        });
      }) as any);

      await GasClient.fetchRemote();
      expect(GasClient.lastHubDiagnosis.value).toBe("TIMEOUT");
    });

    it("respects _workerHubTestOverride = false", async () => {
      GasClient._setWorkerHubTestOverride(false);
      fetchSpy.mockImplementation(((url: string) => {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({
            success: true,
            data: { format: "matrix", timestamp: 123456789, lb: [], hh: [] }
          }))
        });
      }) as any);

      const result = await GasClient.fetchRemote();
      expect(result.dataSource).toBe("GAS");
      // Should not have called worker endpoint
      expect(fetchSpy).not.toHaveBeenCalledWith(expect.stringContaining("/hub/state"), expect.any(Object));
      GasClient._setWorkerHubTestOverride(null);
    });

    it("fails immediately when GAS returns HTML (Auth Failure)", async () => {
      fetchSpy.mockImplementation(((url: string) => {
        if (url.includes("/hub/state")) return Promise.reject(new Error("OFFLINE"));
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve("<html><body>Login</body></html>")
        });
      }) as any);

      await expect(GasClient.fetchRemote()).rejects.toThrow("Backend Configuration Error (HTML Response)");
      // Should only be called once for GAS (plus the worker attempt)
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("exhausts 5 retries on 500 errors and respects backoff", async () => {
      fetchSpy.mockImplementation(((url: string) => {
        if (url.includes("/hub/state")) return Promise.reject(new Error("OFFLINE"));
        return Promise.resolve({
          ok: false,
          status: 500
        });
      }) as any);

      const fetchPromise = GasClient.fetchRemote();
      // Attach catch immediately to prevent Unhandled Rejection warnings
      const assertionPromise = expect(fetchPromise).rejects.toThrow("Server returned HTTP 500");

      // Attempt 0 fails -> wait 1000ms
      await vi.advanceTimersByTimeAsync(1100);
      // Attempt 1 fails -> wait 2000ms
      await vi.advanceTimersByTimeAsync(2100);
      // Attempt 2 fails -> wait 4000ms
      await vi.advanceTimersByTimeAsync(4100);
      // Attempt 3 fails -> wait 8000ms
      await vi.advanceTimersByTimeAsync(8100);
      // Attempt 4 fails -> throws

      await assertionPromise;
      // 1 (worker) + 5 (GAS attempts) = 6
      expect(fetchSpy).toHaveBeenCalledTimes(6);
    });

    it("aborts immediately when signal is triggered mid-retry", async () => {
      fetchSpy.mockImplementation(((url: string, opts: any) => {
        if (opts?.signal?.aborted) {
          const err = new Error("Aborted");
          err.name = "AbortError";
          return Promise.reject(err);
        }
        if (url.includes("/hub/state")) return Promise.reject(new Error("OFFLINE"));
        return Promise.resolve({
          ok: false,
          status: 500
        });
      }) as any);

      const controller = new AbortController();
      const fetchPromise = GasClient.fetchRemote({ signal: controller.signal });
      const assertionPromise = expect(fetchPromise).rejects.toThrow();

      // Ensure first GAS attempt happened and we're in the first delay
      await vi.advanceTimersByTimeAsync(100);

      controller.abort();

      // Advance time to pass the current sleep delay (1000ms)
      await vi.advanceTimersByTimeAsync(1500);

      await assertionPromise;
      // Total calls should be: 1 (worker) + 1 (GAS first fail) + 1 (GAS second abort) = 3
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe("Utility Methods", () => {
    it("ping returns script metadata", async () => {
      fetchSpy.mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({ success: true, data: { version: "1.0" } }))
      } as any);
      const result = await GasClient.ping();
      expect(result.version).toBe("1.0");
    });

    it("pingWorker returns true when hub responds ok", async () => {
      fetchSpy.mockResolvedValueOnce({
          ok: true,
          status: 200
      } as any);
      const result = await GasClient.pingWorker();
      expect(result).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("/hub/ping"), expect.any(Object));
    });

    it("pingWorker returns false when hub fails", async () => {
      fetchSpy.mockRejectedValueOnce(new Error("Network Error"));
      const result = await GasClient.pingWorker();
      expect(result).toBe(false);
    });

    it("dismissRecruits sends correct payload", async () => {
      fetchSpy.mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({ success: true, data: {} }))
      } as any);
      await GasClient.dismissRecruits([{ id: "R1", score: 10 }]);
      expect(fetchSpy).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
        body: expect.stringContaining('"ids":["R1"]')
      }));
    });
  });

  describe("GAS Request Resilience (fetchWithRetry)", () => {
    beforeEach(() => {
      vi.spyOn(Math, "random").mockReturnValue(0);
    });

    it("exhausts 5 attempts and respects exponential backoff", async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 502
      });

      const profilePromise = GasClient.getPlayerProfile("ABC");
      // Attach catch immediately to prevent Unhandled Rejection warnings
      const assertionPromise = expect(profilePromise).rejects.toThrow("HTTP 502");

      // Attempt 0 fails -> wait 2000ms (no jitter)
      await vi.advanceTimersByTimeAsync(2100);
      // Attempt 1 fails -> wait 2000 * 1.8 = 3600
      await vi.advanceTimersByTimeAsync(3700);
      // Attempt 2 fails -> wait 3600 * 1.8 = 6480
      await vi.advanceTimersByTimeAsync(6580);
      // Attempt 3 fails -> wait 6480 * 1.8 = 11664
      await vi.advanceTimersByTimeAsync(11764);
      // Attempt 4 fails -> throws

      await assertionPromise;
      expect(fetchSpy).toHaveBeenCalledTimes(5);
    });

    it("fails fast on HTML response", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve("<html>Error</html>")
      });

      await expect(GasClient.getPlayerProfile("ABC")).rejects.toThrow("Backend Configuration Error");
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });
});
