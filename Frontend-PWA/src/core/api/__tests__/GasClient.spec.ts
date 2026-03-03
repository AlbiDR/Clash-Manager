import { describe, it, expect, vi, beforeEach } from "vitest";
import { inflatePayload, scanRecruitsDirect, subscribeToPush } from "../GasClient";

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
}));

describe("GasClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
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

      // Detailed assertions (Restored from previous version)
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
    const mockWorkerUrl = "https://worker.test";

    beforeEach(() => {
      // Mock worker URL via localStorage
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === "cm_worker_url") return mockWorkerUrl;
        return null;
      });
    });

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
        expect(result![0].d.don).toBe(500);
      });

      it("returns null on validation failure (Sad Path - Target B [1])", async () => {
        const mockInvalidResponse = {
          candidates: [
            {
              // Missing required fields like 'tag' or 'name'
              trophies: 6000,
            },
          ],
        };

        fetchMock.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockInvalidResponse),
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
        localStorageMock.getItem.mockReturnValue(null);

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
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining("/public/subscribe"),
          expect.any(Object)
        );
      });

      it("returns false on fetch failure", async () => {
        fetchMock.mockRejectedValue(new Error("Network Error"));

        const result = await subscribeToPush(mockSubscription);
        expect(result).toBe(false);
      });

      it("returns false if worker URL is not configured", async () => {
        localStorageMock.getItem.mockReturnValue(null);

        const result = await subscribeToPush(mockSubscription);
        expect(result).toBe(false);
      });
    });
  });
});
