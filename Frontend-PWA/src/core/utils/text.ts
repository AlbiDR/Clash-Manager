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

/**
 * CLEAN TAG
 * Removes leading '#' and converts to uppercase for API/Deep Link compatibility.
 *
 * @param tag - The raw player or clan tag.
 * @returns A normalized, uppercase tag string without the hash prefix.
 */
export function cleanTag(tag: string | undefined): string {
  if (!tag) return "";
  return tag.replace(RE_TAG_HASH, "").toUpperCase().trim();
}

/**
 * FORMAT DISPLAY TAG
 * Standardizes the visual presentation of tags (e.g., '#ABC12').
 * Truncates to 5 characters and ensures the '#' prefix is present.
 *
 * @param tag - The raw player or clan tag.
 * @returns A formatted tag string for UI display.
 */
export function formatDisplayTag(tag: string | undefined): string {
  const cleaned = cleanTag(tag);
  if (!cleaned) return "";
  return `#${cleaned.substring(0, 5)}`;
}

/**
 * DESCRIPTION FORMATTER
 * Converts markdown-ish strings from remote data sources into semantic HTML.
 *
 * @remarks
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
    text
      // Section headers (Key: Value or Title:)
      .replace(RE_DESC_SECTION, '<div class="desc-section-title">$1</div>')
      // Bold text (**text**)
      .replace(RE_DESC_BOLD, "<strong>$1</strong>")
      // Bullet points (• item)
      .replace(RE_DESC_BULLET, '<li class="bullet-item">$1</li>')
      // Wrap lists in ul (BEFORE converting newlines to <br>)
      // Use non-greedy matching and group only consecutive li elements.
      // We use a lookahead (?=<li) to ensure we only eat newlines BETWEEN items,
      // preserving the trailing newline after the last item for proper spacing.
      .replace(RE_DESC_LIST, (match) => {
        return `<ul class="desc-list">${match.trim().replace(RE_NEWLINE, "")}</ul>`;
      })
      // Actual Line breaks
      .replace(RE_NEWLINE, "<br>")
  );
}
