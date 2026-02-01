import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  formatTimeAgo,
  formatTimeAgoShort,
  getScoreTone,
  parseTimeAgoValue,
  formatRole,
  cleanTag,
  formatHeaderDescription,
} from "../formatters";

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

  describe("getScoreTone", () => {
    it('returns "tone-high" for scores >= 80', () => {
      expect(getScoreTone(80)).toBe("tone-high");
      expect(getScoreTone(100)).toBe("tone-high");
    });

    it('returns "tone-mid" for scores between 50 and 79', () => {
      expect(getScoreTone(50)).toBe("tone-mid");
      expect(getScoreTone(79)).toBe("tone-mid");
    });

    it('returns "tone-low" for scores < 50', () => {
      expect(getScoreTone(49)).toBe("tone-low");
      expect(getScoreTone(0)).toBe("tone-low");
    });

    it("handles undefined by defaulting to 0", () => {
      expect(getScoreTone(undefined)).toBe("tone-low");
    });
  });

  describe("parseTimeAgoValue", () => {
    it("returns 0 for special cases", () => {
      expect(parseTimeAgoValue(null)).toBe(0);
      expect(parseTimeAgoValue(undefined)).toBe(0);
      expect(parseTimeAgoValue("-")).toBe(0);
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
  });
});
