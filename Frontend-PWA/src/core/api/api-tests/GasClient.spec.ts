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
          roster: {
            headers: ["id", "n", "role", "t", "performanceScore", "performanceRawScore", "days", "req", "avg", "tot", "seen", "rate", "wfame", "hist", "dt", "war"],
            rows: [["W1", "Worker Player", "elder", 6500, 95, 55000, 200, 0, 100, 0, "today", "100%", 2000, "hist", 10, 30]]
          },
          headhunter: {
            headers: ["id", "n", "t", "potentialScore", "potentialRawScore", "don", "war", "cards", "ago", "lastScan"],
            rows: [["R1", "Worker Recruit", 3000, 70, 35000, 100, 5, 50, "1d", 12345678]]
          }
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
    });

    it("falls back to GAS when Worker Hub data fails validation", async () => {
      const invalidHubState = {
        success: true,
        data: {
          metadata: { timestamp: "invalid" },
          data: { roster: { headers: [], rows: [] }, headhunter: { headers: [], rows: [] } }
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
});
