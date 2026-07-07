// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, afterEach } from "vitest";
import { getSupercellLocale } from "../locale";

describe("locale utility", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns fallback 'en' if navigator is undefined (SSR scenario)", () => {
    vi.stubGlobal("navigator", undefined);
    expect(getSupercellLocale()).toBe("en");
  });

  it("returns the primary language tag if supported (e.g., 'it')", () => {
    vi.stubGlobal("navigator", { language: "it" });
    expect(getSupercellLocale()).toBe("it");
  });

  it("normalizes BCP 47 tags correctly (e.g., 'en-US' -> 'en')", () => {
    vi.stubGlobal("navigator", { language: "en-US" });
    expect(getSupercellLocale()).toBe("en");
  });

  it("handles complex BCP 47 tags (e.g., 'zh-Hans-CN' -> 'zh')", () => {
    vi.stubGlobal("navigator", { language: "zh-Hans-CN" });
    expect(getSupercellLocale()).toBe("zh");
  });

  it("handles case-insensitivity in navigator.language (e.g., 'IT' -> 'it')", () => {
    vi.stubGlobal("navigator", { language: "IT" });
    expect(getSupercellLocale()).toBe("it");
  });

  it("returns fallback 'en' for unsupported locales (e.g., 'pl' or 'hu')", () => {
    vi.stubGlobal("navigator", { language: "pl" });
    expect(getSupercellLocale()).toBe("en");

    vi.stubGlobal("navigator", { language: "hu" });
    expect(getSupercellLocale()).toBe("en");
  });

  it("supports all authoritative Supercell locale codes", () => {
    const supported = [
      "en", "de", "fr", "es", "it", "pt", "ru", "tr",
      "ar", "ja", "ko", "zh", "fi", "no", "sv", "da", "nl",
    ];

    supported.forEach((lang) => {
      vi.stubGlobal("navigator", { language: lang });
      expect(getSupercellLocale()).toBe(lang);

      // Verify with regional variant
      vi.stubGlobal("navigator", { language: `${lang}-${lang.toUpperCase()}` });
      expect(getSupercellLocale()).toBe(lang);
    });
  });
});
