// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import type { MomentumInfo } from "@core/types";

/**
 * MODULE: MATH UTILITIES (Layer 1)
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Centralized math and numeric formatting utilities.
 * Handles momentum calculation, numeric sanitization, and time-unit conversion.
 *
 * ARCHITECTURE:
 *    - Stateless: All functions are pure and rely only on inputs.
 * ============================================================================
 */

/**
 * MOMENTUM CALCULATOR
 * Analyzes the delta in Raw Score to produce a human-readable trend % and direction.
 *
 * @remarks
 * [DECISION LOG] MOMENTUM THRESHOLDS:
 * - Minimum Baseline: 50 raw points. Below this, small fluctuations create
 *   misleadingly high percentages.
 * - Outlier Protection: Jumps > 1000% are ignored to protect against data
 *   glitches or initial sync spikes.
 *
 * @param scoreDelta - The numeric change (delta) in score.
 * @param currentRaw - The current raw score value.
 * @returns MomentumInfo containing direction and formatted percentage, or null if insignificant.
 */
export function calculateMomentum(
  scoreDelta: number,
  currentRaw: number,
): MomentumInfo | null {
  if (scoreDelta === 0 || currentRaw === 0) return null;
  const previousRaw = currentRaw - scoreDelta;

  // Safeguard: Score must be significant to show momentum
  if (previousRaw < 50) return null;

  // Safeguard: Ignore massive outliers/glitches (>1000% jump)
  if (previousRaw > 0 && scoreDelta / previousRaw > 10) return null;

  const percentChange = (scoreDelta / previousRaw) * 100;
  const absPercent = Math.abs(percentChange);

  let momentumLabel = "";
  if (absPercent < 0.1 && absPercent > 0) momentumLabel = "<0.1%";
  else if (absPercent < 10) momentumLabel = absPercent.toFixed(1) + "%";
  else momentumLabel = Math.round(absPercent) + "%";

  return {
    momentumLabel,
    dir: scoreDelta > 0 ? "up" : "down",
    raw: scoreDelta,
  };
}

/**
 * Normalizes a potentially NaN value from an empty number input to 0.
 * Enforces a minimum value of 0.
 *
 * @remarks
 * [THREAT:] Empty or Malformed Input.
 * Prevents logic crashes in downstream math operations (like division) by
 * coercing all non-numeric or negative inputs to a safe zero baseline.
 *
 * @param numericValue - The raw input value.
 * @returns A safe numeric representation.
 */
export function sanitizeNumericInput(numericValue: number | '' | null): number {
  if (numericValue === '' || numericValue === null || isNaN(Number(numericValue))) return 0;
  return Number(numericValue) < 0 ? 0 : Number(numericValue);
}

/**
 * Converts a duration in days, hours, and minutes to total seconds.
 *
 * @param days - Number of days.
 * @param hours - Number of hours.
 * @param minutes - Number of minutes.
 * @returns Total duration in seconds.
 */
export function durationToSeconds(
  days: number,
  hours: number,
  minutes: number
): number {
  return days * 86400 + hours * 3600 + minutes * 60;
}

/**
 * Standardized numeric formatter instance for the application.
 *
 * @remarks
 * [DECISION LOG] CACHED FORMATTER:
 * Reusing a single Intl.NumberFormat instance significantly improves performance
 * in high-density list views (like Roster/Headhunter) by avoiding the high
 * CPU overhead of repeated Intl object instantiation.
 */
const DEFAULT_NUMBER_FORMATTER = new Intl.NumberFormat();

/**
 * Standardized numeric formatter for the application.
 * Uses a cached Intl.NumberFormat for standard calls to provide locale-aware thousand separators.
 * Supports custom options and handles null/NaN/undefined by defaulting to 0.
 *
 * @remarks
 * [THREAT:] Numeric Desync / Display Corruption.
 * Ensures that null, undefined, or NaN values from remote APIs do not result
 * in "NaN" or "undefined" appearing in the UI, defaulting to "0" instead.
 *
 * @param numericValue - The numeric value to format.
 * @param options - Optional Intl.NumberFormatOptions for custom formatting.
 * @returns A formatted string representation of the number.
 */
export function formatNumber(
  numericValue: number | null | undefined,
  options?: Intl.NumberFormatOptions
): string {
  const safeVal = (numericValue === null || numericValue === undefined || isNaN(numericValue)) ? 0 : numericValue;

  if (options) {
    return new Intl.NumberFormat(undefined, options).format(safeVal);
  }

  return DEFAULT_NUMBER_FORMATTER.format(safeVal);
}
