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
 * Normalizes a potentially NaN value from an empty number input to 0.
 * Enforces a minimum value of 0.
 *
 * @param val - The raw input value.
 * @returns A safe numeric representation.
 */
export function sanitizeNumericInput(val: number | '' | null): number {
  if (val === '' || val === null || isNaN(Number(val))) return 0;
  return Number(val) < 0 ? 0 : Number(val);
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
