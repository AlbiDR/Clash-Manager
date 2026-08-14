// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import type { T2TInput } from "@core/types";

/**
 * MODULE: TIME UTILITIES (Layer 1)
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Centralized time parsing and formatting utilities.
 * Handles relative time formatting, countdowns, and legacy 'ago' parsing.
 *
 * ARCHITECTURE:
 *    - Stateless: All functions are pure and rely only on inputs.
 *    - Performance: Uses dual-tier caching for expensive parsing operations.
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
/** Regex for parsing PostgreSQL/Supabase timestamps without relying on WebView Date quirks. */
const RE_POSTGRES_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?(?:\s*(Z|[+-]\d{2}(?::?\d{2})?))?$/;

/**
 * DURATION UNITS (Internal/Utility)
 * ----------------------------------------------------------------------------
 */
export interface DurationUnits {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/**
 * Options for countdown formatting.
 */
export interface CountdownOptions {
  /** If true, returns "Dd Hh" if days > 0. Default: false. */
  showDays?: boolean;
}

/**
 * Calculates duration units (days, hours, minutes, seconds) from a millisecond delta.
 *
 * @param ms - The duration in milliseconds.
 * @returns Object containing the calculated units.
 */
export function getDurationUnits(ms: number): DurationUnits {
  const absMs = Math.max(0, ms);
  return {
    days: Math.floor(absMs / 86_400_000),
    hours: Math.floor((absMs % 86_400_000) / 3_600_000),
    minutes: Math.floor((absMs % 3_600_000) / 60_000),
    seconds: Math.floor((absMs % 60_000) / 1_000),
  };
}

/**
 * Formats a date into a countdown string (e.g., 'hh:mm:ss' or '2d 05h').
 *
 * @param end - The target date (Date, string, or timestamp).
 * @param options - Formatting options.
 * @returns A formatted countdown string.
 */
export function formatCountdown(
  end: Date | string | number | null | undefined,
  options: CountdownOptions = {},
): string {
  if (!end) return "";
  const endDate = new Date(end);
  if (isNaN(endDate.getTime())) return "";

  const diff = endDate.getTime() - Date.now();
  if (diff <= 0) return "Ended";

  const { days, hours, minutes, seconds } = getDurationUnits(diff);

  if (options.showDays && days > 0) {
    return `${days}d ${String(hours).padStart(2, "0")}h`;
  }

  // If not showing days explicitly, we accumulate days into hours for standard hh:mm:ss
  const totalHours = options.showDays ? hours : days * 24 + hours;

  return `${String(totalHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function normalizeTimezoneOffset(offset: string | undefined): string {
  if (!offset || offset === "Z") return "Z";
  if (/^[+-]\d{2}$/.test(offset)) return `${offset}:00`;
  if (/^[+-]\d{4}$/.test(offset)) return `${offset.slice(0, 3)}:${offset.slice(3)}`;
  return offset;
}

function parseAbsoluteTimeMs(dateInput: string | number | null | undefined): number | null {
  if (typeof dateInput === "number") return Number.isFinite(dateInput) ? dateInput : null;
  if (!dateInput) return null;

  const trimmedInput = dateInput.trim();
  if (!trimmedInput) return null;

  const customMatch = trimmedInput.match(RE_CUSTOM_DATE);
  if (customMatch) {
    const day = parseInt(customMatch[1], 10);
    const month = parseInt(customMatch[2], 10) - 1;
    const year = parseInt(customMatch[3], 10);
    const hour = parseInt(customMatch[4], 10);
    const min = parseInt(customMatch[5], 10);
    const sec = parseInt(customMatch[6], 10);
    const customDate = new Date(year, month, day, hour, min, sec);
    return Number.isNaN(customDate.getTime()) ? null : customDate.getTime();
  }

  const postgresMatch = trimmedInput.match(RE_POSTGRES_TIMESTAMP);
  if (postgresMatch) {
    const [, year, month, day, hour, min, sec = "00", fraction = "", timezone] = postgresMatch;
    const normalizedTimezone = normalizeTimezoneOffset(timezone);
    const normalizedTimestamp = `${year}-${month}-${day}T${hour}:${min}:${sec}${fraction}${normalizedTimezone}`;
    const parsedTimestamp = Date.parse(normalizedTimestamp);
    return Number.isNaN(parsedTimestamp) ? null : parsedTimestamp;
  }

  const parsedTimestamp = Date.parse(trimmedInput);
  return Number.isNaN(parsedTimestamp) ? null : parsedTimestamp;
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
  dateStr: string | number | null | undefined,
  shortMode: boolean,
): string => {
  if (!dateStr) return "-";
  if (!shortMode && dateStr === "Just now") return dateStr;

  const dateTimeMs = parseAbsoluteTimeMs(dateStr);
  if (dateTimeMs === null) return "-";

  const now = new Date();
  const seconds = Math.floor((now.getTime() - dateTimeMs) / 1000);

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
 * @param dateStr - The date string or timestamp to format.
 * @returns A full relative time string.
 */
export const formatTimeAgo = (dateStr: string | number | null | undefined): string =>
  formatTime(dateStr, false);

/**
 * Formats a date string into a compact relative time (e.g., '2d').
 *
 * @param dateStr - The date string or timestamp to format.
 * @returns A short relative time string.
 */
export const formatTimeAgoShort = (
  dateStr: string | number | null | undefined,
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
 * @param timeString - The time string to parse (ISO, Custom, or Legacy 'ago').
 * @returns The number of minutes elapsed since the timestamp.
 */
export function parseTimeAgoValue(timeString: string | null | undefined): number {
  if (!timeString || timeString === "-") return 99999999;

  // Tier 1: Relative Cache (Stateless)
  // Rationale: Pre-formatted strings like "2d ago" are constant deltas in minutes.
  const cachedRel = REL_CACHE.get(timeString);
  if (cachedRel !== undefined) return cachedRel;

  // Tier 2: Absolute Cache (Stateful)
  // Rationale: Avoid expensive Date parsing for repeated ISO/Timestamp strings.
  const cachedAbs = ABS_CACHE.get(timeString);
  if (cachedAbs !== undefined) {
    return cachedAbs === null ? 99999999 : Math.floor((Date.now() - cachedAbs) / 60000);
  }

  // 1. Try parsing as an absolute timestamp using deterministic normalizers.
  const ts = parseAbsoluteTimeMs(timeString);
  if (ts !== null) {
    ABS_CACHE.set(timeString, ts);
    return Math.floor((Date.now() - ts) / 60000);
  }

  // 2. Legacy Fallback: Parse "2d ago" strings (Old Backend / UI formatted)
  if (timeString === "Just now") {
    REL_CACHE.set(timeString, 0);
    return 0;
  }

  const match = timeString.match(TIME_AGO_REGEX);
  if (match) {
    const num = parseInt(match[1], 10);
    const unit = match[2];
    const result = num * (TIME_AGO_MULTIPLIERS[unit] || 1);
    REL_CACHE.set(timeString, result);
    return result;
  }

  // Final Fallback: Mark as unparseable
  ABS_CACHE.set(timeString, null);
  return 99999999;
}

/**
 * Converts a relative Time-to-Timestamp input into an absolute ISO-8601 string.
 *
 * @param input - The duration in days, hours, and minutes.
 * @returns An ISO-8601 timestamp string relative to the current time.
 */
export function t2tToTimestamp(input: T2TInput): string {
  const totalMs =
    input.days * 86_400_000 +
    input.hours * 3_600_000 +
    input.minutes * 60_000;
  return new Date(Date.now() + totalMs).toISOString();
}
