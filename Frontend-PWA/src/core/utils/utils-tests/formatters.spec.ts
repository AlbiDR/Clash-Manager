// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  formatTimeAgo,
  formatTimeAgoShort,
  parseTimeAgoValue,
  formatRole,
  cleanTag,
  formatHeaderDescription,
  calculateMomentum,
  getDurationUnits,
  formatCountdown,
  sanitizeNumericInput,
  durationToSeconds,
} from "@core/utils/formatters";

describe("formatters", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("formatTimeAgo", () => {
    it("returns '-' for null/undefined/empty", () => {
      expect(formatTimeAgo(null)).toBe("-");
      expect(formatTimeAgo(undefined)).toBe("-");
      expect(formatTimeAgo("")).toBe("-");
    });

    it("returns '-' for invalid dates", () => {
      expect(formatTimeAgo("invalid-date")).toBe("-");
    });

    it('returns "Just now" for dates < 60s ago', () => {
      const now = new Date("2026-01-01T12:00:00Z");
      vi.setSystemTime(now);
      const secondsAgo = new Date("2026-01-01T11:59:30Z").toISOString();
      expect(formatTimeAgo(secondsAgo)).toBe("Just now");
    });

    it('returns "Just now" for future dates', () => {
      const now = new Date("2026-01-01T12:00:00Z");
      vi.setSystemTime(now);
      const future = new Date("2026-01-01T12:05:00Z").toISOString();
      expect(formatTimeAgo(future)).toBe("Just now");
    });

    it("returns correct minutes ago", () => {
      const now = new Date("2026-01-01T12:00:00Z");
      vi.setSystemTime(now);
      // 5 minutes ago
      const fiveMinsAgo = new Date("2026-01-01T11:55:00Z").toISOString();
      expect(formatTimeAgo(fiveMinsAgo)).toBe("5m ago");
    });

    it("returns correct hours ago", () => {
      const now = new Date("2026-01-01T12:00:00Z");
      vi.setSystemTime(now);
      // 2 hours ago
      const twoHoursAgo = new Date("2026-01-01T10:00:00Z").toISOString();
      expect(formatTimeAgo(twoHoursAgo)).toBe("2h ago");
    });

    it("returns correct days ago", () => {
      const now = new Date("2026-01-05T12:00:00Z");
      vi.setSystemTime(now);
      // 4 days ago
      const fourDaysAgo = new Date("2026-01-01T12:00:00Z").toISOString();
      expect(formatTimeAgo(fourDaysAgo)).toBe("4d ago");
    });

    it("returns correct weeks ago", () => {
      const now = new Date("2026-01-15T12:00:00Z");
      vi.setSystemTime(now);
      // 2 weeks ago (14 days)
      const twoWeeksAgo = new Date("2026-01-01T12:00:00Z").toISOString();
      expect(formatTimeAgo(twoWeeksAgo)).toBe("2w ago");
    });

    it("returns correct months ago", () => {
      const now = new Date("2026-03-01T12:00:00Z");
      vi.setSystemTime(now);
      // ~2 months ago (60 days)
      const twoMonthsAgo = new Date("2025-12-31T12:00:00Z").toISOString();
      expect(formatTimeAgo(twoMonthsAgo)).toBe("2mo ago");
    });

    it("returns correct years ago", () => {
      const now = new Date("2027-01-01T12:00:00Z");
      vi.setSystemTime(now);
      // 1 year ago
      const oneYearAgo = new Date("2026-01-01T12:00:00Z").toISOString();
      expect(formatTimeAgo(oneYearAgo)).toBe("1y ago");
    });
  });

  describe("formatTimeAgoShort", () => {
    it("returns short format (no space)", () => {
      const now = new Date("2026-01-01T12:00:00Z");
      vi.setSystemTime(now);
      const fiveMinsAgo = new Date("2026-01-01T11:55:00Z").toISOString();
      expect(formatTimeAgoShort(fiveMinsAgo)).toBe("5m");
    });

    it("returns 'New' for < 60s ago", () => {
      const now = new Date("2026-01-01T12:00:00Z");
      vi.setSystemTime(now);
      const secondsAgo = new Date("2026-01-01T11:59:30Z").toISOString();
      expect(formatTimeAgoShort(secondsAgo)).toBe("New");
    });
  });

  describe("parseTimeAgoValue", () => {
    it("returns sentinel value for null/undefined/-", () => {
      expect(parseTimeAgoValue(null)).toBe(99999999);
      expect(parseTimeAgoValue(undefined)).toBe(99999999);
      expect(parseTimeAgoValue("-")).toBe(99999999);
    });

    it("returns 0 for 'Just now'", () => {
      expect(parseTimeAgoValue("Just now")).toBe(0);
    });

    it("correctly parses minutes, hours, days, and years", () => {
      expect(parseTimeAgoValue("10m ago")).toBe(10);
      expect(parseTimeAgoValue("2h ago")).toBe(120);
      expect(parseTimeAgoValue("1d ago")).toBe(1440);
      expect(parseTimeAgoValue("1y ago")).toBe(525600);
    });

    it("correctly parses weeks and months", () => {
      expect(parseTimeAgoValue("1w ago")).toBe(10080);
      expect(parseTimeAgoValue("2mo ago")).toBe(86400);
    });

    it("correctly parses custom Project Standard date format", () => {
      // Set fixed system time using local date components to match parser behavior
      const now = new Date(2026, 1, 2, 19, 0, 0); // Feb 2, 2026, 19:00:00
      vi.setSystemTime(now);

      const customDateStr = "02/02/2026 18.50.00";
      expect(parseTimeAgoValue(customDateStr)).toBe(10);
    });

    it("returns 99999999 for unknown patterns", () => {
      expect(parseTimeAgoValue("some text")).toBe(99999999);
      expect(parseTimeAgoValue("10 days ago")).toBe(99999999);
    });
  });

  describe("formatRole", () => {
    it("identifies Leader", () => {
      expect(formatRole("Leader")).toEqual({ label: "Leader", class: "role-leader" });
      expect(formatRole("leader")).toEqual({ label: "Leader", class: "role-leader" });
    });

    it("identifies Co-Leader variations", () => {
      expect(formatRole("Co-Leader")).toEqual({ label: "Co-Lead", class: "role-coleader" });
      expect(formatRole("coleader")).toEqual({ label: "Co-Lead", class: "role-coleader" });
    });

    it("identifies Elder", () => {
      expect(formatRole("Elder")).toEqual({ label: "Elder", class: "role-elder" });
    });

    it("defaults to Member", () => {
      expect(formatRole("Member")).toEqual({ label: "Member", class: "role-member" });
      expect(formatRole("")).toEqual({ label: "Member", class: "role-member" });
      expect(formatRole("Newbie")).toEqual({ label: "Member", class: "role-member" });
    });
  });

  describe("cleanTag", () => {
    it("removes leading hashtag", () => {
      expect(cleanTag("#ABC123")).toBe("ABC123");
    });

    it("converts to uppercase and trims", () => {
      expect(cleanTag("  abc123  ")).toBe("ABC123");
    });

    it("handles undefined/empty input", () => {
      expect(cleanTag(undefined)).toBe("");
      expect(cleanTag("")).toBe("");
    });
  });

  describe("formatHeaderDescription", () => {
    it("returns empty string for empty input", () => {
      expect(formatHeaderDescription("")).toBe("");
    });

    it("converts bold text", () => {
      expect(formatHeaderDescription("This is **bold**")).toBe("This is <strong>bold</strong>");
    });

    it("converts section headers", () => {
      // NOTE: Section titles with asterisks are currently double-processed (title div + strong tag)
      expect(formatHeaderDescription("**Header:**")).toBe(
        '<div class="desc-section-title"><strong>Header:</strong></div>',
      );
      expect(formatHeaderDescription("Simple Title:")).toBe(
        '<div class="desc-section-title">Simple Title:</div>',
      );
    });

    it("handles bullet points and wraps them in ul", () => {
      const input = "• Item 1\n• Item 2";
      const output = formatHeaderDescription(input);
      expect(output).toContain('<ul class="desc-list">');
      expect(output).toContain('<li class="bullet-item">Item 1</li>');
      expect(output).toContain('<li class="bullet-item">Item 2</li>');
      expect(output).toContain("</ul>");
    });

    it("converts newlines to br", () => {
      expect(formatHeaderDescription("Line 1\nLine 2")).toBe("Line 1<br>Line 2");
    });

    it("handles multiple sections and mixed content correctly", () => {
      const input = "**Section 1**\n• Item A\n• Item B\n\n**Section 2:**\nSome text here.";
      const output = formatHeaderDescription(input);

      // Verify sections
      expect(output).toContain('<div class="desc-section-title"><strong>Section 1</strong></div>');
      expect(output).toContain('<div class="desc-section-title"><strong>Section 2:</strong></div>');

      // Verify list
      expect(output).toContain('<ul class="desc-list">');
      expect(output).toContain('<li class="bullet-item">Item A</li>');
      expect(output).toContain('<li class="bullet-item">Item B</li>');

      // Verify line breaks
      expect(output).toContain("<br>");
    });

    it("handles bullet points separated by text", () => {
      const input = "• Item 1\nInterruption\n• Item 2";
      const output = formatHeaderDescription(input);

      // FIX VERIFIED: Separate lists should NOT be merged.
      // We expect two separate ULs with the interruption in between.
      expect(output).toBe(
        '<ul class="desc-list"><li class="bullet-item">Item 1</li></ul><br>Interruption<br><ul class="desc-list"><li class="bullet-item">Item 2</li></ul>',
      );
    });

    it("handles complex mixed markdown", () => {
      const input = "**Requirements:**\n• **TH15+**\n• Active in War\n\n**Notes:**\nContact @Leader";
      const output = formatHeaderDescription(input);

      expect(output).toContain('<strong>TH15+</strong>');
      expect(output).toContain('<li class="bullet-item"><strong>TH15+</strong></li>');
      expect(output).toContain('<div class="desc-section-title"><strong>Requirements:</strong></div>');
    });

    it("should handle multiple newlines between list items correctly", () => {
      const input = "• Item 1\n\n• Item 2";
      const output = formatHeaderDescription(input);

      // Current implementation merges consecutive bullet points if they are only separated by newlines.
      // But if there are TWO newlines, the regex should ideally treat them as separate lists or
      // preserve the double break.
      expect(output).toContain('<ul class="desc-list">');
      expect(output).toContain('Item 1');
      expect(output).toContain('Item 2');
    });

    it("should handle leading/trailing spaces in list items", () => {
      const input = "•   Item with leading spaces   ";
      const output = formatHeaderDescription(input);
      expect(output).toContain('<li class="bullet-item">  Item with leading spaces   </li>');
    });

    it("should not merge bullets with non-bullet text in between", () => {
      const input = "• Item 1\nSome regular text\n• Item 2";
      const output = formatHeaderDescription(input);

      const ulCount = (output.match(/<ul/g) || []).length;
      expect(ulCount).toBe(2);
      expect(output).toContain('Some regular text');
    });

    it("should handle section titles with trailing spaces (FIXED)", () => {
      const input = "Section Title:  ";
      const output = formatHeaderDescription(input);
      // FIXED: Regex now handles trailing spaces and wraps the title correctly.
      expect(output).toBe('<div class="desc-section-title">Section Title:</div>');
    });
  });

  describe("getDurationUnits", () => {
    it("calculates units correctly for positive ms", () => {
      const ms = 1 * 86400000 + 5 * 3600000 + 10 * 60000 + 15 * 1000;
      expect(getDurationUnits(ms)).toEqual({
        days: 1,
        hours: 5,
        minutes: 10,
        seconds: 15,
      });
    });

    it("clamps negative ms to 0", () => {
      expect(getDurationUnits(-1000)).toEqual({
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
      });
    });
  });

  describe("formatCountdown", () => {
    beforeEach(() => {
      vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    });

    it("returns empty string for null/undefined", () => {
      expect(formatCountdown(null)).toBe("");
      expect(formatCountdown(undefined)).toBe("");
    });

    it("returns 'Ended' for past dates", () => {
      const past = new Date("2026-01-01T11:00:00Z");
      expect(formatCountdown(past)).toBe("Ended");
    });

    it("formats hh:mm:ss by default", () => {
      const future = new Date("2026-01-01T13:05:10Z"); // 01:05:10
      expect(formatCountdown(future)).toBe("01:05:10");
    });

    it("accumulates days into hours by default", () => {
      const future = new Date("2026-01-02T13:05:10Z");
      expect(formatCountdown(future)).toBe("25:05:10"); // 1d 1h = 24+1 = 25
    });

    it("formats 'Dd Hh' when showDays is true", () => {
      const future = new Date("2026-01-02T13:05:10Z");
      expect(formatCountdown(future, { showDays: true })).toBe("1d 01h");
    });

    it("uses hh:mm:ss even if showDays is true but days < 1", () => {
      const future = new Date("2026-01-01T13:05:10Z");
      expect(formatCountdown(future, { showDays: true })).toBe("01:05:10");
    });
  });

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
        val: "10%",
        dir: "up",
        raw: 10,
      });
    });

    it("calculates negative momentum correctly", () => {
      // previousRaw = 100, dt = -5 => -5%
      const result = calculateMomentum(-5, 95);
      expect(result).toEqual({
        val: "5.0%",
        dir: "down",
        raw: -5,
      });
    });

    it("formats small percentages as <0.1%", () => {
      // previousRaw = 10000, dt = 5 => 0.05%
      const result = calculateMomentum(5, 10005);
      expect(result?.val).toBe("<0.1%");
    });

    it("formats percentages < 10% with one decimal", () => {
      // previousRaw = 100, dt = 5.5 => 5.5%
      const result = calculateMomentum(5.5, 105.5);
      expect(result?.val).toBe("5.5%");
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
});
