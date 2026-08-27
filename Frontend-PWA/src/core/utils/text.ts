// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * MODULE: TEXT UTILITIES (Layer 1)
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Centralized text and HTML formatting utilities.
 * Handles tag normalization and Markdown-like description parsing.
 *
 * ARCHITECTURE:
 *    - Stateless: All functions are pure and rely only on inputs.
 * ============================================================================
 */

/** Regex for identifying leading player/clan tag hashes. */
const RE_TAG_HASH = /^#/;
/** Regex for identifying section titles in Markdown-like descriptions. */
const RE_DESC_SECTION = /^(\*\*.*?\*\*|.*?:)\s*$/gm;
/** Regex for bold text markdown. */
const RE_DESC_BOLD = /\*\*(.*?)\*\*/g;
/** Regex for bullet point markdown. */
const RE_DESC_BULLET = /^• (.+)$/gm;
/** Regex for grouping list items into semantic <ul> structures. */
const RE_DESC_LIST = /(<li class="bullet-item">.*?<\/li>[^\S\r\n]*(\r?\n(?=<li class="bullet-item">))?)+/g;
/** Global newline regex. */
const RE_NEWLINE = /\n/g;
/** Characters that must be escaped before inserting formatted text with v-html. */
const RE_HTML_ESCAPE = /[&<>"']/g;
/** Entity lookup for HTML escaping. */
const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

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

/**
 * DESCRIPTION FORMATTER
 * Converts markdown-ish strings from remote data sources into semantic HTML.
 *
 * @remarks
 * Satisfies ADR Section III: Validation & Data Ingress Boundaries.
 * Implements a custom parsing pipeline for section titles, bold text, and
 * bulleted lists. Specifically handles consecutive list items to wrap them
 * in valid <ul> tags for accessibility.
 *
 * @param text - The raw Markdown-like text from a remote data cell.
 * @returns Sanitized and formatted HTML string.
 */
export function formatHeaderDescription(text: string): string {
  if (!text) return "";

  return (
    // Escape HTML special characters first to neutralize XSS payload injection
    escapeHtml(text)
      // Transform markdown section headers (Key: Value or Title:) to styled containers
      .replace(RE_DESC_SECTION, '<div class="desc-section-title">$1</div>')
      // Convert bold markdown delimiters (**text**) to HTML strong elements
      .replace(RE_DESC_BOLD, "<strong>$1</strong>")
      // Convert bullet character prefixes to HTML list item elements
      .replace(RE_DESC_BULLET, '<li class="bullet-item">$1</li>')
      // Group consecutive li items into semantic ul wrappers prior to newline conversion
      .replace(RE_DESC_LIST, (match) => {
        return `<ul class="desc-list">${match.trim().replace(RE_NEWLINE, "")}</ul>`;
      })
      // Convert remaining raw line breaks to HTML break elements
      .replace(RE_NEWLINE, "<br>")
  );
}

/**
 * ESCAPE HTML
 * Replaces unsafe HTML entities with safely escaped character codes.
 *
 * @param text - Unsanitized raw string.
 * @returns Escaped string safe for HTML rendering.
 */
function escapeHtml(text: string): string {
  // Replace XSS sensitive characters using entity lookup table
  return text.replace(RE_HTML_ESCAPE, (character) => HTML_ESCAPE_MAP[character]);
}
