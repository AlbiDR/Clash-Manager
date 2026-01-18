import { describe, it, expect } from "vitest";
import { inflatePayload } from "../gasClient";

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
          "r",
          "s",
          "dt",
          "war",
        ],
        hh: ["id", "n", "t", "s", "don", "war", "ago", "cards"],
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
          9500, // 12: r
          100, // 13: s
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
    expect(result.lb[0].s).toBe(100);
    expect(result.lb[0].r).toBe(9500);
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
      // [id, n, t, s, don, war, ago, cards]
      hh: [["recruit1", "New Guy", 3000, 60, 500, 20, "2024-01-01", 1000]],
      timestamp: 123456789,
    };

    const result = await inflatePayload(rawMatrixData);

    expect(result.hh).toHaveLength(1);
    expect(result.hh[0].id).toBe("recruit1");
    expect(result.hh[0].n).toBe("New Guy");
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

  it("semantically corrects swapped s/r values", async () => {
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
          "r",
          "s",
          "dt",
          "war",
        ],
        hh: [],
      },
      lb: [
        [
          "p1",
          "Tester",
          "m",
          0,
          0,
          0,
          0,
          0,
          "",
          "",
          0,
          "",
          100, // index 12: r (input shows 100, which looks like s)
          52052, // index 13: s (input shows 52052, which looks like r)
          0,
          0,
        ],
      ],
      hh: [],
      timestamp: 123456789,
    };

    const result = await inflatePayload(rawMatrixData);
    // Should swap them back
    expect(result.lb[0].s).toBe(100);
    expect(result.lb[0].r).toBe(52052);
  });
});
