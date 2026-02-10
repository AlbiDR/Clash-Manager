import { describe, it, expect } from "vitest";
import { createSchemaMap, mapLbRow, mapHhRow } from "@core";

describe("gasClient Helpers", () => {
  describe("createSchemaMap", () => {
    it("creates a map from array of strings", () => {
      const schema = ["id", "name", "score"];
      const result = createSchemaMap(schema);
      expect(result).toEqual({
        id: 0,
        name: 1,
        score: 2,
      });
    });

    it("handles empty schema", () => {
      expect(createSchemaMap([])).toEqual({});
    });
  });

  describe("mapLbRow", () => {
    const map = {
      id: 0,
      n: 1,
      t: 2,
      performanceScore: 3,
      performanceRawScore: 4,
      dt: 5,
      role: 6,
      days: 7,
      avg: 8,
      seen: 9,
      rate: 10,
      wfame: 11,
      hist: 12,
    };

    it("correctly maps a full row", () => {
      const row = [
        "p1", "Arthur", 5000, 95, 50000, 5, "Leader", 100, 50, "2h ago", "90%", 1500, "hist"
      ];
      const result = mapLbRow(row, map);
      expect(result).toEqual({
        id: "p1",
        n: "Arthur",
        t: 5000,
        performanceScore: 95,
        performanceRawScore: 50000,
        dt: 5,
        d: {
          role: "Leader",
          days: 100,
          avg: 50,
          seen: "2h ago",
          rate: "90%",
          wfame: 1500,
          hist: "hist"
        }
      });
    });

    it("handles legacy keys 's' and 'r'", () => {
      const legacyMap = { id: 0, s: 1, r: 2 };
      const row = ["p1", 80, 40000];
      const result = mapLbRow(row, legacyMap as any);
      expect(result?.performanceScore).toBe(80);
      expect(result?.performanceRawScore).toBe(40000);
    });

    it("handles missing values with defaults", () => {
      const row = ["p1"];
      const result = mapLbRow(row, { id: 0 } as any);
      expect(result?.n).toBe("");
      expect(result?.d.seen).toBe("-");
      expect(result?.d.rate).toBe("0%");
    });
  });

  describe("mapHhRow", () => {
    const map = {
      id: 0,
      n: 1,
      t: 2,
      potentialScore: 3,
      potentialRawScore: 4,
      don: 5,
      war: 6,
      ago: 7,
      cards: 8
    };

    it("correctly maps a recruit row", () => {
      const row = ["r1", "Galahad", 4500, 70, 35000, 200, 15, "2023-01-01", 1000];
      const result = mapHhRow(row, map);
      expect(result).toEqual({
        id: "r1",
        n: "Galahad",
        t: 4500,
        potentialScore: 70,
        potentialRawScore: 35000,
        lastScan: 0,
        d: {
          don: 200,
          war: 15,
          ago: "2023-01-01",
          cards: 1000
        }
      });
    });
  });
});
