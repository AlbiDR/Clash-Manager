// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { WAR_CONSTANTS, calculatePrediction, parseHistoryString } from "@core";
import { describe, it, expect } from "vitest";

describe("predictionMath", () => {
  describe("parseHistoryString", () => {
    it("returns an empty array for empty, undefined, or '-' strings", () => {
      expect(parseHistoryString("")).toEqual([]);
      expect(parseHistoryString(undefined)).toEqual([]);
      expect(parseHistoryString("-")).toEqual([]);
    });

    it("correctly parses a single history entry", () => {
      const input = "3000 24W01";
      const result = parseHistoryString(input);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        value: 3000,
        weekId: "24W01",
        readableWeek: "Week 1",
      });
    });

    it("correctly parses multiple history entries in order", () => {
      const input = "3000 24W01 | 2500 24W02 | 1000 24W03";
      const result = parseHistoryString(input);
      expect(result).toHaveLength(3);
      expect(result[0].value).toBe(3000);
      expect(result[1].value).toBe(2500);
      expect(result[2].value).toBe(1000);
      expect(result[1].readableWeek).toBe("Week 2");
    });

    it("handles whitespace and extra separators", () => {
      const input = "  3000 24W01 |   | 2500 24W02  ";
      const result = parseHistoryString(input);
      expect(result).toHaveLength(2);
      expect(result[0].value).toBe(3000);
      expect(result[1].value).toBe(2500);
    });

    it("defaults value to 0 for invalid values", () => {
      const input = "invalid 24W01";
      const result = parseHistoryString(input);
      expect(result[0].value).toBe(0);
    });

    it("handles invalid week formats gracefully", () => {
      const input = "3000 XYZ";
      const result = parseHistoryString(input);
      expect(result[0].readableWeek).toBe("XYZ");
    });
    
    it("handles dates without week format", () => {
      const input = "100 2026-05-18";
      const result = parseHistoryString(input);
      expect(result[0].readableWeek).toBe("05/18");
    });
  });

  describe("calculatePrediction", () => {
    it("returns 0 for empty history", () => {
      expect(calculatePrediction([], 3600)).toBe(0);
    });

    it("uses 100% of last week for single week history", () => {
      // 1 item: weight is 1.0. Total weight = 1.0. Result = 2000.
      expect(calculatePrediction([2000], 3600)).toBe(2000);
    });

    it("calculates 10-week linear decay for 2 weeks history", () => {
      // Weights: Week 1 (i=0): 1.0, Week 2 (i=1): 0.95. Total weight = 1.95
      // Score: 3000 * 1.0 + 1000 * 0.95 = 3000 + 950 = 3950
      // 3950 / 1.95 ≈ 2025.64
      const expected = (3000 * 1.0 + 1000 * 0.95) / 1.95;
      expect(calculatePrediction([3000, 1000], 3600)).toBe(expected);
    });

    it("calculates 10-week linear decay for long history, flooring weight at 0.5", () => {
      // We will supply 12 items of 1000 each. The average should be exactly 1000.
      const history = Array(12).fill(1000);
      expect(calculatePrediction(history, 3600)).toBe(1000);
    });

    it("clamps result to maxScore", () => {
      // MAX_FAME = 3600
      expect(calculatePrediction([4000], 3600)).toBe(3600);
    });

    it("clamps result to 0", () => {
       expect(calculatePrediction([-100], 3600)).toBe(0);
    });
  });
});
