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
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  formatTimeAgo,
  formatTimeAgoShort,
  parseTimeAgoValue,
  getDurationUnits,
  formatCountdown,
  t2tToTimestamp,
} from "../time";

describe("time utilities", () => {
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

    it("parses Supabase PostgreSQL timestamps consistently", () => {
      vi.setSystemTime(new Date("2026-08-14T12:00:00Z"));
      expect(formatTimeAgo("2026-08-13 21:00:00+00")).toBe("15h ago");
      expect(formatTimeAgo("2026-08-13 21:00:00+0000")).toBe("15h ago");
      expect(formatTimeAgo("2026-08-13 21:00:00+00:00")).toBe("15h ago");
    });

    it("passes through compact server-generated relative labels", () => {
      expect(formatTimeAgo("Now")).toBe("Now");
      expect(formatTimeAgo("15h")).toBe("15h");
      expect(formatTimeAgo("2w")).toBe("2w");
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
      expect(parseTimeAgoValue("1w")).toBe(10080);
      expect(parseTimeAgoValue("15h")).toBe(900);
      expect(parseTimeAgoValue("Now")).toBe(0);
      expect(parseTimeAgoValue("2mo ago")).toBe(86400);
    });

    it("correctly parses custom Project Standard date format", () => {
      // Set fixed system time using local date components to match parser behavior
      const now = new Date(2026, 1, 2, 19, 0, 0); // Feb 2, 2026, 19:00:00
      vi.setSystemTime(now);

      const customDateStr = "02/02/2026 18.50.00";
      expect(parseTimeAgoValue(customDateStr)).toBe(10);
    });

    it("parses Supabase PostgreSQL timestamps for sorting and benchmarks", () => {
      vi.setSystemTime(new Date("2026-08-14T12:00:00Z"));
      expect(parseTimeAgoValue("2026-08-13 21:00:00+00")).toBe(900);
      expect(parseTimeAgoValue("2026-08-13 21:00:00.123+0000")).toBe(899);
      expect(parseTimeAgoValue("2026-08-13 21:00:00+00:00")).toBe(900);
    });

    it("returns 99999999 for unknown patterns", () => {
      expect(parseTimeAgoValue("some text")).toBe(99999999);
      expect(parseTimeAgoValue("10 days ago")).toBe(99999999);
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

    it("returns empty string for invalid date strings", () => {
      expect(formatCountdown("invalid-date")).toBe("");
    });
  });

  describe("t2tToTimestamp", () => {
    beforeEach(() => {
      vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    });

    it("converts duration to ISO-8601 string relative to now", () => {
      const input = { days: 1, hours: 2, minutes: 30 };
      // 1d 2h 30m = 86400 + 7200 + 1800 = 95400 seconds
      const expected = new Date("2026-01-02T14:30:00Z").toISOString();
      expect(t2tToTimestamp(input)).toBe(expected);
    });

    it("handles zero duration", () => {
      const input = { days: 0, hours: 0, minutes: 0 };
      expect(t2tToTimestamp(input)).toBe(new Date("2026-01-01T12:00:00Z").toISOString());
    });

    it("handles large duration values", () => {
      const input = { days: 100, hours: 0, minutes: 0 };
      const expected = new Date("2026-04-11T12:00:00Z").toISOString();
      expect(t2tToTimestamp(input)).toBe(expected);
    });
  });
});
