import { inflatePayload } from "@core";
import { describe, it, expect } from "vitest";
describe("gasClient Data Inflation", () => {
  it("correctly inflates Leaderboard matrix", async () => {
    const rawMatrixData = {
      format: "matrix",
      schema: {
        lb: [
          "id",
          "n",
          "role",
          "t",
          "days",
          "req",
          "avg",
          "tot",
          "seen",
          "rate",
          "wfame",
          "hist",
          "performanceRawScore", // explicit key
          "performanceScore", // explicit key
          "dt",
          "war",
        ],
        hh: ["id", "n", "t", "potentialScore", "don", "war", "ago", "cards"],
      },
      lb: [
        [
          "player1", // 0: id
          "King Arthur", // 1: n
          "leader", // 2: role
          5000, // 3: t
          100, // 4: days
          500, // 5: req
          50, // 6: avg
          1000, // 7: tot
          "2023-01-01", // 8: seen
          "100%", // 9: rate
          1500, // 10: wfame
          "3000 24W01", // 11: hist
          52102, // 12: performanceRawScore
          100, // 13: performanceScore
          5, // 14: dt
          20, // 15: war
        ],
      ],
      hh: [],
      timestamp: 123456789,
    };

    const result = await inflatePayload(rawMatrixData);

    // Check first player
    expect(result.lb[0].id).toBe("player1");
    expect(result.lb[0].n).toBe("King Arthur");
    expect(result.lb[0].t).toBe(5000);
    expect(result.lb[0].performanceScore).toBe(100);
    expect(result.lb[0].performanceRawScore).toBe(52102);
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
    expect(result.hh[0].d.don).toBe(500);
    expect(result.hh[0].d.war).toBe(20);
    expect(result.hh[0].d.cards).toBe(1000);
    expect(result.hh[0].potentialScore).toBe(60);
    expect(result.hh[0].potentialRawScore).toBe(42000);
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

  it("handles malformed string inputs (String Transport Protocol)", async () => {
    const rawMatrixData = {
      format: "matrix",
      schema: { lb: [], hh: [] },
      // Added columns to satisfy new length (16 indices)
      lb: [["p1", "Test", "m", 0, 0, 0, 0, 0, "", "", 0, "", 0, 0, 0, 0]],
      hh: [],
      timestamp: 123456789,
    };

    // Simulate double-encoded JSON string
    const stringified = JSON.stringify(rawMatrixData);

    const result = await inflatePayload(stringified);
    expect(result.lb).toHaveLength(1);
    expect(result.lb[0].id).toBe("p1");
  });

  it("handles backwards compatibility for older cached data", async () => {
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
