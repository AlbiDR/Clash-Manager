// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * MODULE: TEXT UTILITIES (Layer 1)
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Centralized text formatting utilities.
 * Handles tag normalization and byte-size display formatting.
 *
 * ARCHITECTURE:
 *    - Stateless: All functions are pure and rely only on inputs.
 * ============================================================================
 */

/** Regex for identifying leading player/clan tag hashes. */
const RE_TAG_HASH = /^#/;

/**
 * CLEAN TAG
 * Removes leading '#' and converts to uppercase for API/Deep Link compatibility.
 *
 * @remarks
 * Satisfies ADR Section VII: Naming & Identifier Conventions. Strips leading hashes
 * and normalizes casing to uppercase for uniform URL and query param parameterization.
 *
 * @param tag - The raw player or clan tag string to sanitize.
 * @returns A normalized, uppercase tag string without the hash prefix, or empty string if input is falsy.
 */
export function cleanTag(tag: string | undefined): string {
  if (!tag) return "";
  // Strip leading hash symbol and convert string to uppercase for consistent processing
  return tag.replace(RE_TAG_HASH, "").toUpperCase().trim();
}

/**
 * NORMALIZE TAG
 * Ensures a player or clan tag is standardized: uppercase, trimmed, and prefixed with '#'.
 * Satisfies Backend substrate expectations for consistent indexing and caching.
 *
 * @remarks
 * Satisfies ADR Section III: Validation & Data Ingress Boundaries.
 * Guarantees uniform database key format across Layer 1 services.
 *
 * @param tag - The raw player or clan tag string.
 * @returns A normalized tag string (e.g., '#ABC123'), or empty string if input is falsy.
 */
export function normalizeTag(tag: string | undefined): string {
  const cleaned = cleanTag(tag);
  if (!cleaned) return "";
  // Re-prepend hash symbol to form canonical domain player/clan identifier
  return `#${cleaned}`;
}

/**
 * FORMAT DISPLAY TAG
 * Standardizes the visual presentation of tags (e.g., '#ABC12').
 * Truncates to 5 characters and ensures the '#' prefix is present.
 *
 * @remarks
 * Satisfies ADR Section IV: UI Substrate & Layout Containment.
 * Enforces maximum visual target bounds for compact card headers.
 *
 * @param tag - The raw player or clan tag string.
 * @returns A formatted tag string for UI display, or empty string if input is falsy.
 */
export function formatDisplayTag(tag: string | undefined): string {
  const cleaned = cleanTag(tag);
  if (!cleaned) return "";
  // Truncate tag body to 5 characters to fit tight visual component boundaries
  return `#${cleaned.substring(0, 5)}`;
}

/**
 * FORMAT BYTES
 * Formats raw byte counts into human-readable MB or KB strings.
 *
 * @remarks
 * Satisfies ADR Section IV: Presentation Formatting.
 * Formats raw asset and payload sizes into localized human-readable units.
 *
 * @param sizeBytes - Raw file size in bytes.
 * @returns Formatted string (e.g. "12.4 MB", "850 KB", or "Size unknown" if undefined/zero).
 */
export function formatBytes(sizeBytes: number | undefined): string {
  if (!sizeBytes) return "Size unknown";
  // Convert bytes to Megabytes if magnitude reaches 1MB threshold
  if (sizeBytes >= 1024 * 1024) return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
  // Format smaller payloads as rounded Kilobytes
  return `${Math.round(sizeBytes / 1024)} KB`;
}
