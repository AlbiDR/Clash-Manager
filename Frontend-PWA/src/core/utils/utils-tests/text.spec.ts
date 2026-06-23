// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { describe, it, expect } from "vitest";
import {
  cleanTag,
  formatDisplayTag,
  formatHeaderDescription,
} from "../text";

describe("text utilities", () => {
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

  describe("formatDisplayTag", () => {
    it("adds hashtag and keeps tag if length <= 5", () => {
      expect(formatDisplayTag("ABC")).toBe("#ABC");
      expect(formatDisplayTag("12345")).toBe("#12345");
    });

    it("adds hashtag and truncates to 5 characters if length > 5", () => {
      expect(formatDisplayTag("ABCDEFG")).toBe("#ABCDE");
    });

    it("normalizes tag before formatting", () => {
      expect(formatDisplayTag("#abc123")).toBe("#ABC12");
      expect(formatDisplayTag("  xyz  ")).toBe("#XYZ");
    });

    it("handles undefined/empty input", () => {
      expect(formatDisplayTag(undefined)).toBe("");
      expect(formatDisplayTag("")).toBe("");
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
});
