import { describe, it, expect } from "vitest";
import { inflatePayload } from "../gasClient";

describe("gasClient Data Inflation", () => {
  it("correctly inflates Leaderboard matrix", async () => {
    const rawMatrixData = {
      format: "matrix",
      schema: { lb: [], hh: [] }, // Actual schema not used by parsing logic, just marker
      // [buf(0), tag(1), name(2), role(3), trophies(4), days(5), rec(6), avg(7), tot(8), seen(9), rate(10), wfame(11), hist(12), raw(13), perf(14), trend(15)]
      lb: [
        [
          "player1",
          "King Arthur",
          5000,
          100,
          "leader",
          100,
          50,
          "2023-01-01",
          "100%",
          1500,
          "3000 24W01",
          5,
          9500,
        ],
        [
          "player2",
          "Lancelot",
          4000,
          80,
          "member",
          5,
          10,
          "2023-01-02",
          "50%",
          0,
          "",
          0,
          8000,
        ],
      ],
      hh: [],
      timestamp: 123456789,
    };

    const result = await inflatePayload(rawMatrixData);

    // Check first player
    expect(result.lb[0].id).toBe("player1");
    expect(result.lb[0].n).toBe("King Arthur");
    expect(result.lb[0].t).toBe(5000); // parsed "5,000"
    expect(result.lb[0].s).toBe(100); // parsed "100%"
    expect(result.lb[0].r).toBe(9500); // parsed "9,500"
    expect(result.lb[0].d.role).toBe("leader");
    expect(result.lb[0].d.days).toBe(100);
    expect(result.lb[0].d.avg).toBe(50);
    expect(result.lb[0].d.seen).toBe("2023-01-01");
    expect(result.lb[0].d.wfame).toBe(1500);

    // Check second player
    expect(result.lb[1].id).toBe("player2");
    expect(result.lb[1].s).toBe(80); // parsed "80%"
    expect(result.lb[1].r).toBe(8000);
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
      // Added missing columns to satisfy new length check (16 indices)
      lb: [["p1", "Test", 0, 0, "m", 0, 0, "", "", 0, "", 0, 0]],
      hh: [],
      timestamp: 123456789,
    };

    // Simulate double-encoded JSON string
    const stringified = JSON.stringify(rawMatrixData);

    const result = await inflatePayload(stringified);
    expect(result.lb).toHaveLength(1);
    expect(result.lb[0].id).toBe("p1");
  });
});
