import { WAR_CONSTANTS, calculatePrediction, parseHistoryString } from "@core";
import { describe, it, expect } from "vitest";

describe("warMath", () => {
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
        fame: 3000,
        weekId: "24W01",
        readableWeek: "Week 1",
      });
    });

    it("correctly parses multiple history entries in order", () => {
      const input = "3000 24W01 | 2500 24W02 | 1000 24W03";
      const result = parseHistoryString(input);
      expect(result).toHaveLength(3);
      expect(result[0].fame).toBe(3000);
      expect(result[1].fame).toBe(2500);
      expect(result[2].fame).toBe(1000);
      expect(result[1].readableWeek).toBe("Week 2");
    });

    it("handles whitespace and extra separators", () => {
      const input = "  3000 24W01 |   | 2500 24W02  ";
      const result = parseHistoryString(input);
      expect(result).toHaveLength(2);
      expect(result[0].fame).toBe(3000);
      expect(result[1].fame).toBe(2500);
    });

    it("handles double delimiters (empty segments)", () => {
      const input = "3000 24W01 || 2500 24W02";
      const result = parseHistoryString(input);
      expect(result).toHaveLength(2);
      expect(result[0].fame).toBe(3000);
      expect(result[1].fame).toBe(2500);
    });

    it("handles leading and trailing delimiters", () => {
      const input = "| 3000 24W01 | 2500 24W02 |";
      const result = parseHistoryString(input);
      expect(result).toHaveLength(2);
      expect(result[0].fame).toBe(3000);
      expect(result[1].fame).toBe(2500);
    });

    it("defaults fame to 0 for invalid values", () => {
      const input = "invalid 24W01";
      const result = parseHistoryString(input);
      expect(result[0].fame).toBe(0);
    });

    it("handles invalid week formats gracefully", () => {
      const input = "3000 XYZ";
      const result = parseHistoryString(input);
      expect(result[0].readableWeek).toBe("XYZ");
    });

    it("supports comma as a delimiter", () => {
      const input = "3000 24W01, 2500 24W02";
      const result = parseHistoryString(input);
      expect(result).toHaveLength(2);
      expect(result[0].fame).toBe(3000);
      expect(result[1].fame).toBe(2500);
    });

    it("supports mixed delimiters (pipe and comma)", () => {
      const input = "3000 24W01 | 2500 24W02, 2000 24W03";
      const result = parseHistoryString(input);
      expect(result).toHaveLength(3);
      expect(result[0].fame).toBe(3000);
      expect(result[1].fame).toBe(2500);
      expect(result[2].fame).toBe(2000);
    });
  });

  describe("calculatePrediction", () => {
    it("returns 0 for empty history", () => {
      expect(calculatePrediction([])).toBe(0);
    });

    it("uses 100% of last week for single week history", () => {
      expect(calculatePrediction([2000])).toBe(2000);
    });

    it("applies weights for 2 weeks history", () => {
      // 2 weeks weights: [0.7, 0.3]
      // 0.7 * 3000 + 0.3 * 1000 = 2100 + 300 = 2400
      expect(calculatePrediction([3000, 1000])).toBe(2400);
    });

    it("applies weights for 4 weeks history", () => {
      // 4 weeks weights: [0.5, 0.25, 0.15, 0.1]
      const history = [2000, 2000, 2000, 2000];
      const expected = (2000 * 0.5) + (2000 * 0.25) + (2000 * 0.15) + (2000 * 0.1);
      // 1000 + 500 + 300 + 200 = 2000
      expect(calculatePrediction(history)).toBe(2000);
    });

    it("applies weights for 5 weeks history", () => {
      // 5 weeks weights: [0.4, 0.25, 0.15, 0.12, 0.08]
      const history = [3000, 2000, 1000, 500, 100];
      const expected = (3000 * 0.4) + (2000 * 0.25) + (1000 * 0.15) + (500 * 0.12) + (100 * 0.08);
      // 1200 + 500 + 150 + 60 + 8 = 1918
      expect(calculatePrediction(history)).toBe(1918);
    });

    it("adds streak bonus if last 3 weeks are above threshold (> 2000)", () => {
      const bonus = WAR_CONSTANTS.STREAK_BONUS; // 160
      // [2001, 2001, 2001] -> weight for 3: [0.6, 0.3, 0.1]
      // 0.6 * 2001 + 0.3 * 2001 + 0.1 * 2001 = 2001
      // 2001 + 160 = 2161
      expect(calculatePrediction([2001, 2001, 2001])).toBe(2001 + bonus);
    });

    it("does not add streak bonus if one of last 3 weeks is exactly at WIN_THRESHOLD", () => {
      // [2500, 2000, 2500] -> no bonus
      const expected = (2500 * 0.6) + (2000 * 0.3) + (2500 * 0.1);
      // 1500 + 600 + 250 = 2350
      expect(calculatePrediction([2500, 2000, 2500])).toBe(2350);
    });

    it("does not add streak bonus if one of last 3 weeks is below threshold", () => {
      // [2500, 1500, 2500] -> no bonus
      const expected = (2500 * 0.6) + (1500 * 0.3) + (2500 * 0.1);
      // 1500 + 450 + 250 = 2200
      expect(calculatePrediction([2500, 1500, 2500])).toBe(2200);
    });

    it("only uses the last 5 weeks for lookback even if history is longer", () => {
      // Weights for 5: [0.4, 0.25, 0.15, 0.12, 0.08]
      const history = [1000, 1000, 1000, 1000, 1000, 5000, 5000];
      // It should only use the first 5 1000s.
      expect(calculatePrediction(history)).toBe(1000);
    });

    it("handles sparse arrays safely", () => {
      // 3 weeks weights: [0.6, 0.3, 0.1]
      const history = [1000, undefined as any, 1000];
      // 0.6 * 1000 + 0 * 0.3 + 0.1 * 1000 = 600 + 100 = 700
      expect(calculatePrediction(history)).toBe(700);
    });

    it("clamps result to MAX_FAME", () => {
      // MAX_FAME = 3200
      expect(calculatePrediction([4000])).toBe(WAR_CONSTANTS.MAX_FAME);
    });

    it("clamps result to 0", () => {
       // Should not really happen with positive fame, but logic-wise
       expect(calculatePrediction([-100])).toBe(0);
    });
  });
});
