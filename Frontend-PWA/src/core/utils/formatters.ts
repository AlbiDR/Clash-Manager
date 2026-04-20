// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import type { MomentumInfo } from "@core/types";

/**
 * MODULE: FORMATTERS (Layer 1)
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Centralized formatting utilities for consistency across the application.
 * Handles time parsing, role normalization, score coloring, and description sanitization.
 *
 * ARCHITECTURE:
 *    - Stateless: All functions are pure and rely only on inputs.
 *    - Performance: Uses hoisting for static assets (TIME_UNITS) and dual-tier
 *      caching for expensive parsing operations (parseTimeAgoValue).
 *
 * ROLE: Core utility for UI-level data transformation.
 * ============================================================================
 */

// --- STATIC ASSETS (Hoisted for Performance) ---
/** Unit conversion table for relative time formatting. */
const TIME_UNITS = [
  { s: 31536000, t: "y", l: "y ago" },
  { s: 2592000, t: "mo", l: "mo ago" },
  { s: 604800, t: "w", l: "w ago" },
  { s: 86400, t: "d", l: "d ago" },
  { s: 3600, t: "h", l: "h ago" },
  { s: 60, t: "m", l: "m ago" },
] as const;

/** Regex for parsing Project Standard date format: dd/MM/yyyy HH.mm.ss */
const RE_CUSTOM_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2})\.(\d{2})\.(\d{2})$/;
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
 * Determines the CSS tone class based on a numeric score.
 *
 * @param score - The numeric performance or potential score.
 * @returns A string representing the CSS class for coloring (high/mid/low).
 */
export function getScoreTone(score: number | undefined): string {
  const s = score || 0;
  if (s >= 80) return "tone-high";
  if (s >= 50) return "tone-mid";
  return "tone-low";
}

/**
 * Internal utility to calculate relative time difference.
 *
 * @param dateStr - The source date string.
 * @param shortMode - If true, returns compact units (e.g., '2d').
 * @returns A formatted relative time string.
 * @internal
 */
const formatTime = (
  dateStr: string | null | undefined,
  shortMode: boolean,
): string => {
  if (!dateStr) return "-";
  if (!shortMode && dateStr === "Just now") return dateStr;

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "-";

  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 0) return shortMode ? "New" : "Just now";

  for (const unit of TIME_UNITS) {
    if (seconds >= unit.s) {
      const value = Math.floor(seconds / unit.s);
      return shortMode ? `${value}${unit.t}` : `${value}${unit.l}`;
    }
  }

  return shortMode ? "New" : "Just now";
};

/**
 * Formats a date string into a human-readable relative time (e.g., '2d ago').
 *
 * @param dateStr - The date string to format.
 * @returns A full relative time string.
 */
export const formatTimeAgo = (dateStr: string | null | undefined): string =>
  formatTime(dateStr, false);

/**
 * Formats a date string into a compact relative time (e.g., '2d').
 *
 * @param dateStr - The date string to format.
 * @returns A short relative time string.
 */
export const formatTimeAgoShort = (
  dateStr: string | null | undefined,
): string => formatTime(dateStr, true);

/** Regex for legacy 'X units ago' strings. */
const TIME_AGO_REGEX = /^(\d+)(mo|[ymdhw]) ago$/;
/** Multipliers to convert various units into minutes. */
const TIME_AGO_MULTIPLIERS: Record<string, number> = {
  m: 1,
  h: 60,
  d: 1440,
  w: 10080,
  mo: 43200,
  y: 525600,
};

/** L2 Cache: Stores absolute timestamps to avoid re-parsing identical ISO strings. */
const ABS_CACHE = new Map<string, number | null>();
/** L1 Cache: Stores static minute values for pre-formatted 'ago' strings. */
const REL_CACHE = new Map<string, number>();

/**
 * OPTIMIZED PARSER
 * Converts human-readable time strings into numeric minutes for O(1) sorting.
 *
 * @remarks
 * Implements a dual-tier cache strategy:
 * 1. Absolute dates are cached as Epoch Timestamps (number). The relative delta
 *    is recalculated against Date.now() on every call to ensure accuracy.
 * 2. Relative strings ("2d ago") are cached as constant minute values.
 *
 * @param val - The time string to parse (ISO, Custom, or Legacy 'ago').
 * @returns The number of minutes elapsed since the timestamp.
 */
export function parseTimeAgoValue(val: string | null | undefined): number {
  if (!val || val === "-") return 99999999;

  // Tier 1: Relative Cache (Stateless)
  // Rationale: Pre-formatted strings like "2d ago" are constant deltas in minutes.
  const cachedRel = REL_CACHE.get(val);
  if (cachedRel !== undefined) return cachedRel;

  // Tier 2: Absolute Cache (Stateful)
  // Rationale: Avoid expensive Date parsing for repeated ISO/Timestamp strings.
  const cachedAbs = ABS_CACHE.get(val);
  if (cachedAbs !== undefined) {
    return cachedAbs === null ? 99999999 : Math.floor((Date.now() - cachedAbs) / 60000);
  }

  // 1. Try parsing custom format: dd/MM/yyyy HH.mm.ss (Project Standard)
  const customMatch = val.match(RE_CUSTOM_DATE);
  if (customMatch) {
    const day = parseInt(customMatch[1], 10);
    const month = parseInt(customMatch[2], 10) - 1;
    const year = parseInt(customMatch[3], 10);
    const hour = parseInt(customMatch[4], 10);
    const min = parseInt(customMatch[5], 10);
    const sec = parseInt(customMatch[6], 10);
    const date = new Date(year, month, day, hour, min, sec);

    if (!isNaN(date.getTime())) {
      const ts = date.getTime();
      ABS_CACHE.set(val, ts);
      return Math.floor((Date.now() - ts) / 60000);
    }
  }

  // 2. Try parsing as Standard Date / ISO String (Fallback)
  const date = new Date(val);
  if (!isNaN(date.getTime())) {
    const ts = date.getTime();
    ABS_CACHE.set(val, ts);
    return Math.floor((Date.now() - ts) / 60000);
  }

  // 3. Legacy Fallback: Parse "2d ago" strings (Old Backend / UI formatted)
  if (val === "Just now") {
    REL_CACHE.set(val, 0);
    return 0;
  }

  const match = val.match(TIME_AGO_REGEX);
  if (match) {
    const num = parseInt(match[1], 10);
    const unit = match[2];
    const result = num * (TIME_AGO_MULTIPLIERS[unit] || 1);
    REL_CACHE.set(val, result);
    return result;
  }

  // Final Fallback: Mark as unparseable
  ABS_CACHE.set(val, null);
  return 99999999;
}

/**
 * MOMENTUM CALCULATOR
 * Analyzes the delta in Raw Score to produce a human-readable trend % and direction.
 *
 * @param dt - The numeric change (delta) in score.
 * @param currentRaw - The current raw score value.
 * @returns MomentumInfo containing direction and formatted percentage, or null if insignificant.
 */
export function calculateMomentum(
  dt: number,
  currentRaw: number,
): MomentumInfo | null {
  if (dt === 0 || currentRaw === 0) return null;
  const previousRaw = currentRaw - dt;

  // Safeguard: Score must be significant to show momentum
  if (previousRaw < 50) return null;

  // Safeguard: Ignore massive outliers/glitches (>1000% jump)
  if (previousRaw > 0 && dt / previousRaw > 10) return null;

  const percentChange = (dt / previousRaw) * 100;
  const absPercent = Math.abs(percentChange);

  let valStr = "";
  if (absPercent < 0.1 && absPercent > 0) valStr = "<0.1%";
  else if (absPercent < 10) valStr = absPercent.toFixed(1) + "%";
  else valStr = Math.round(absPercent) + "%";

  return {
    val: valStr,
    dir: dt > 0 ? "up" : "down",
    raw: dt,
  };
}

/**
 * Normalizes a raw role string from the API into a display label and CSS class.
 *
 * @param roleStr - The raw role string (e.g., 'coleader', 'elder').
 * @returns Object containing the formatted label and its associated CSS class.
 */
export function formatRole(roleStr: string): { label: string; class: string } {
  const r = (roleStr || "").toLowerCase();
  if (r.includes("leader") && !r.includes("co"))
    return { label: "Leader", class: "role-leader" };
  if (r.includes("coleader") || r.includes("co-leader"))
    return { label: "Co-Lead", class: "role-coleader" };
  if (r.includes("elder")) return { label: "Elder", class: "role-elder" };
  return { label: "Member", class: "role-member" };
}

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
 * DESCRIPTION FORMATTER
 * Converts markdown-ish strings from Google Sheet notes into semantic HTML.
 *
 * @remarks
 * Implements a custom parsing pipeline for section titles, bold text, and
 * bulleted lists. Specifically handles consecutive list items to wrap them
 * in valid <ul> tags for accessibility.
 *
 * @param text - The raw Markdown-like text from a spreadsheet cell.
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
