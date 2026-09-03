// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment node
 *
 * No DOM in this file, so it skips jsdom entirely. Building a jsdom Window
 * costs ~410ms per test file and dominated the suite (80.6s of ~120s CPU,
 * against 8.1s of actual test execution). Adding anything here that touches
 * `document`, `window`, `localStorage` or mounts a component will fail loudly
 * and immediately - remove this docblock if that is intentional.
 */
import { describe, it, expect } from "vitest";
import {
  calculateMomentum,
  sanitizeNumericInput,
  durationToSeconds,
  formatNumber,
} from "../math";

describe("math utilities", () => {
  describe("calculateMomentum", () => {
    it("returns null if dt or currentRaw is 0", () => {
      expect(calculateMomentum(0, 100)).toBeNull();
      expect(calculateMomentum(10, 0)).toBeNull();
    });

    it("returns null if previousRaw is < 50", () => {
      // currentRaw = 55, dt = 10 => previousRaw = 45
      expect(calculateMomentum(10, 55)).toBeNull();
    });

    it("returns null if jump is > 1000% (outlier)", () => {
      // currentRaw = 1200, dt = 1100 => previousRaw = 100
      // 1100 / 100 = 11 (1100%)
      expect(calculateMomentum(1100, 1200)).toBeNull();
    });

    it("calculates positive momentum correctly", () => {
      // previousRaw = 100, dt = 10 => 10%
      const result = calculateMomentum(10, 110);
      expect(result).toEqual({
        momentumLabel: "10%",
        dir: "up",
        raw: 10,
      });
    });

    it("calculates negative momentum correctly", () => {
      // previousRaw = 100, dt = -5 => -5%
      const result = calculateMomentum(-5, 95);
      expect(result).toEqual({
        momentumLabel: "5.0%",
        dir: "down",
        raw: -5,
      });
    });

    it("formats small percentages as <0.1%", () => {
      // previousRaw = 10000, dt = 5 => 0.05%
      const result = calculateMomentum(5, 10005);
      expect(result?.momentumLabel).toBe("<0.1%");
    });

    it("formats percentages < 10% with one decimal", () => {
      // previousRaw = 100, dt = 5.5 => 5.5%
      const result = calculateMomentum(5.5, 105.5);
      expect(result?.momentumLabel).toBe("5.5%");
    });
  });

  describe("sanitizeNumericInput", () => {
    it("returns the number if positive", () => {
      expect(sanitizeNumericInput(5)).toBe(5);
    });

    it("returns 0 for empty string", () => {
      expect(sanitizeNumericInput("")).toBe(0);
    });

    it("returns 0 for null", () => {
      expect(sanitizeNumericInput(null)).toBe(0);
    });

    it("returns 0 for NaN or invalid numeric strings", () => {
      expect(sanitizeNumericInput(NaN)).toBe(0);
      // @ts-expect-error - testing invalid input
      expect(sanitizeNumericInput("abc")).toBe(0);
    });

    it("returns 0 for negative numbers", () => {
      expect(sanitizeNumericInput(-5)).toBe(0);
    });
  });

  describe("durationToSeconds", () => {
    it("calculates total seconds correctly", () => {
      // 1d (86400) + 1h (3600) + 1m (60) = 90060
      expect(durationToSeconds(1, 1, 1)).toBe(90060);
    });

    it("returns 0 for all zero inputs", () => {
      expect(durationToSeconds(0, 0, 0)).toBe(0);
    });

    it("handles large values", () => {
      // 10d = 864000
      expect(durationToSeconds(10, 0, 0)).toBe(864000);
    });
  });

  describe("formatNumber", () => {
    it("formats small numbers correctly", () => {
      const val = 1000;
      const expected = new Intl.NumberFormat().format(val);
      expect(formatNumber(val)).toBe(expected);
    });

    it("formats large numbers with separators", () => {
      const val = 1234567.89;
      const expected = new Intl.NumberFormat().format(val);
      expect(formatNumber(val)).toBe(expected);
    });

    it("handles null, undefined, and NaN by defaulting to 0", () => {
      const expectedZero = new Intl.NumberFormat().format(0);
      expect(formatNumber(null)).toBe(expectedZero);
      expect(formatNumber(undefined)).toBe(expectedZero);
      expect(formatNumber(NaN)).toBe(expectedZero);
    });

    it("supports custom Intl.NumberFormatOptions", () => {
      const val = 0.1234;
      const options: Intl.NumberFormatOptions = { style: "percent", minimumFractionDigits: 2 };
      const expected = new Intl.NumberFormat(undefined, options).format(val);
      expect(formatNumber(val, options)).toBe(expected);
    });
  });
});
