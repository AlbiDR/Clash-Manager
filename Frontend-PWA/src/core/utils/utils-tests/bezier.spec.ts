import { describe, it, expect } from "vitest";
import { generateLinearTrend, Point } from "@core/utils/bezier";

describe("bezier", () => {
  describe("generateLinearTrend", () => {
    it("returns empty path and false for less than 2 points", () => {
      expect(generateLinearTrend([])).toEqual({ path: "", isPositive: false });
      expect(generateLinearTrend([{ x: 0, y: 0 }])).toEqual({ path: "", isPositive: false });
    });

    it("calculates correct trend for two points with positive visual slope", () => {
      // In SVG, Y increases downwards.
      // Visual UP (Value increasing) means Y decreases as X increases -> Negative slope.
      const points: Point[] = [
        { x: 0, y: 100 },
        { x: 10, y: 50 },
      ];
      const result = generateLinearTrend(points);
      expect(result.isPositive).toBe(true); // Slope is (50-100)/(10-0) = -5. -5 < 0 is true.
      expect(result.path).toBe("M 0.00,100.00 L 10.00,50.00");
    });

    it("calculates correct trend for two points with negative visual slope", () => {
      // Visual DOWN (Value decreasing) means Y increases as X increases -> Positive slope.
      const points: Point[] = [
        { x: 0, y: 50 },
        { x: 10, y: 100 },
      ];
      const result = generateLinearTrend(points);
      expect(result.isPositive).toBe(false); // Slope is (100-50)/(10-0) = 5. 5 < 0 is false.
      expect(result.path).toBe("M 0.00,50.00 L 10.00,100.00");
    });

    it("handles horizontal line", () => {
      const points: Point[] = [
        { x: 0, y: 50 },
        { x: 10, y: 50 },
      ];
      const result = generateLinearTrend(points);
      expect(result.isPositive).toBe(false); // Slope is 0. 0 < 0 is false.
      expect(result.path).toBe("M 0.00,50.00 L 10.00,50.00");
    });

    it("calculates trend line for multiple points", () => {
        // points approximately on y = -x + 100
        const points: Point[] = [
            { x: 0, y: 100 },
            { x: 5, y: 92 },
            { x: 10, y: 90 },
        ];
        // sumX = 15, sumY = 282, sumXY = 0*100 + 5*92 + 10*90 = 460 + 900 = 1360
        // sumXX = 0 + 25 + 100 = 125
        // slope = (3*1360 - 15*282) / (3*125 - 15*15)
        // slope = (4080 - 4230) / (375 - 225) = -150 / 150 = -1
        // intercept = (282 - (-1)*15) / 3 = (282 + 15) / 3 = 297 / 3 = 99
        // y1 (x=0) = -1*0 + 99 = 99
        // y2 (x=10) = -1*10 + 99 = 89
        const result = generateLinearTrend(points);
        expect(result.isPositive).toBe(true);
        expect(result.path).toBe("M 0.00,99.00 L 10.00,89.00");
    });
  });
});
