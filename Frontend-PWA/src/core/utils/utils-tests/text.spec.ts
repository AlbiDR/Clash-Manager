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
  cleanTag,
  normalizeTag,
  formatDisplayTag,
  formatBytes,
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

  describe("normalizeTag", () => {
    it("ensures tag is uppercase and prefixed with #", () => {
      expect(normalizeTag("abc123")).toBe("#ABC123");
      expect(normalizeTag("#xyz")).toBe("#XYZ");
    });

    it("handles whitespace", () => {
      expect(normalizeTag("#abc  ")).toBe("#ABC");
      expect(normalizeTag("  xyz  ")).toBe("#XYZ");
    });

    it("handles undefined/empty input", () => {
      expect(normalizeTag(undefined)).toBe("");
      expect(normalizeTag("")).toBe("");
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

  describe("formatBytes", () => {
    it("handles undefined or zero bytes", () => {
      expect(formatBytes(undefined)).toBe("Size unknown");
      expect(formatBytes(0)).toBe("Size unknown");
    });

    it("formats kilobyte values", () => {
      expect(formatBytes(850 * 1024)).toBe("850 KB");
      expect(formatBytes(512)).toBe("1 KB");
    });

    it("formats megabyte values", () => {
      expect(formatBytes(15 * 1024 * 1024)).toBe("15.0 MB");
      expect(formatBytes(12.4 * 1024 * 1024)).toBe("12.4 MB");
    });
  });
});
