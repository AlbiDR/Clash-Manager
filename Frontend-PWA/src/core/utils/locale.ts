// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * UTILITY: locale
 *
 * @remarks
 * Pure locale-detection helpers for building locale-aware external URLs.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 (@core/utils)
 * - **Import Boundaries:** Zero external imports. Pure functions only.
 * - **Responsibility:** Map the browser's navigator.language to a locale
 *   code supported by Supercell's web properties, falling back to "en".
 */

/**
 * Supercell-supported locale codes for their ID and Store properties.
 * Source: observed URL patterns on id.supercell.com and store.supercell.com.
 */
const SUPERCELL_SUPPORTED_LOCALES = new Set([
  "en", "de", "fr", "es", "it", "pt", "ru", "tr",
  "ar", "ja", "ko", "zh", "fi", "no", "sv", "da", "nl",
]);

const SUPERCELL_LOCALE_FALLBACK = "en";

/**
 * Returns the primary language tag (BCP 47) from navigator.language,
 * normalized to a Supercell-supported locale code.
 *
 * @remarks
 * Reads navigator.language at call-time so it reflects the current browser
 * session without requiring a reactive wrapper.
 *
 * @returns A supported Supercell locale code (e.g. "en", "it", "de").
 */
export function getSupercellLocale(): string {
  if (typeof navigator === "undefined") return SUPERCELL_LOCALE_FALLBACK;

  // BCP 47 primary subtag: "it-IT" -> "it", "zh-TW" -> "zh", "en-GB" -> "en"
  const primaryTag = navigator.language.split("-")[0].toLowerCase();

  return SUPERCELL_SUPPORTED_LOCALES.has(primaryTag)
    ? primaryTag
    : SUPERCELL_LOCALE_FALLBACK;
}
