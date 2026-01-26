import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { formatTimeAgo, formatTimeAgoShort } from "../formatters";

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

    it('returns correct minutes ago', () => {
      const now = new Date("2026-01-01T12:00:00Z");
      vi.setSystemTime(now);
      // 5 minutes ago
      const fiveMinsAgo = new Date("2026-01-01T11:55:00Z").toISOString();
      expect(formatTimeAgo(fiveMinsAgo)).toBe("5m ago");
    });

    it('returns correct hours ago', () => {
      const now = new Date("2026-01-01T12:00:00Z");
      vi.setSystemTime(now);
      // 2 hours ago
      const twoHoursAgo = new Date("2026-01-01T10:00:00Z").toISOString();
      expect(formatTimeAgo(twoHoursAgo)).toBe("2h ago");
    });

    it('returns correct days ago', () => {
      const now = new Date("2026-01-05T12:00:00Z");
      vi.setSystemTime(now);
      // 4 days ago
      const fourDaysAgo = new Date("2026-01-01T12:00:00Z").toISOString();
      expect(formatTimeAgo(fourDaysAgo)).toBe("4d ago");
    });

    it('returns correct weeks ago', () => {
        const now = new Date("2026-01-15T12:00:00Z");
        vi.setSystemTime(now);
        // 2 weeks ago (14 days)
        const twoWeeksAgo = new Date("2026-01-01T12:00:00Z").toISOString();
        expect(formatTimeAgo(twoWeeksAgo)).toBe("2w ago");
    });

    it('returns correct months ago', () => {
        const now = new Date("2026-03-01T12:00:00Z");
        vi.setSystemTime(now);
        // ~2 months ago (60 days)
        const twoMonthsAgo = new Date("2025-12-31T12:00:00Z").toISOString();
        expect(formatTimeAgo(twoMonthsAgo)).toBe("2mo ago");
    });

    it('returns correct years ago', () => {
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
});
