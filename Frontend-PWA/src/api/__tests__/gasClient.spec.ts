import { describe, it, expect } from "vitest";
import { inflatePayload } from "../gasClient";

describe("gasClient Data Inflation", () => {
  it("correctly inflates Leaderboard matrix", async () => {
    const rawMatrixData = {
      format: "matrix",
      schema: { lb: [], hh: [] }, // Actual schema not used by parsing logic, just marker
      // [tag(0), name(1), role(2), trophies(3), days(4), rec(5), avg(6), tot(7), seen(8), rate(9), wfame(10), hist(11), raw(12), perf(13), trend(14)]
      lb: [
        [
          "player1",
          "King Arthur",
          "leader",
          "5,000",
          100,
          200,
          50,
          1000,
          "2023-01-01",
          "100%",
          1500,
          "3000 24W01",
          "9,500", // Raw Score (12)
          "100%", // Performance Score (13)
          "5", // Trend (14)
        ],
        [
          "player2",
          "Lancelot",
          "member",
          4000,
          5,
          100,
          10,
          200,
          "2023-01-02",
          "50%",
          0,
          "",
          8000, // Raw Score (12)
          "80%", // Performance Score (13)
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
      lb: [["buf", "p1", "Test", "m", 0, 0, 0, 0, 0, "", "", 0, "", 0, 0, 0]],
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
