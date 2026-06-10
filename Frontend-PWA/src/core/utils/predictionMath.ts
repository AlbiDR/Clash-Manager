// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * ============================================================================
 * MODULE: PREDICTION MATHEMATICS
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Provides mathematical utilities for analyzing historical
 * performance and projecting future outcomes for both War and Voyage.
 *
 * ARCHITECTURE:
 *    - Layer: Layer 1 (@core)
 *    - 10-Week Linear Decay: Scale 100% -> 55% (decrement 0.05 per week).
 *      Week 11+ floors at 50%.
 * ============================================================================
 */

/** Constants for Clan War scoring boundaries. */
export const WAR_CONSTANTS = {
  /** Maximum fame achievable in a single war week. */
  MAX_FAME: 3600,
};

/** Constants for Voyage scoring boundaries. */
export const VOYAGE_CONSTANTS = {
  /** Maximum crowns achievable in a single voyage cycle. */
  MAX_CROWNS: 250,
};

/**
 * Represents a normalized data point extracted from a historical performance string.
 */
export interface HistoryEntry {
  /** The numeric performance value (fame or crowns). */
  value: number;
  /** The unique week identifier (e.g., '2026-W34'). */
  weekId: string;
  /** Human-readable week label for UI display. */
  readableWeek: string;
}

/**
 * PARSER: PERFORMANCE HISTORY
 * Converts semi-structured history strings into a sorted array of entries.
 *
 * @remarks
 * Architectural Context:
 * - Layer: Layer 1 (@core/utils)
 * - Satisfies ADR Section I: Core Utilities.
 *
 * This parser handles multiple legacy formats including comma/pipe separated
 * lists and custom date strings.
 *
 * @param historyStr - The raw history string from the remote data source.
 * @returns Array of parsed {@link HistoryEntry} objects.
 */
export function parseHistoryString(
  historyStr: string | undefined,
): HistoryEntry[] {
  if (!historyStr || historyStr === "-") return [];

  const weekRegex = /(\d+)[W-](?:W)?(\d+)/;

  return historyStr
    .split(/[|,]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((entry) => {
      const [valStr, weekStr] = entry.split(" ");
      const value = parseInt(valStr || "0", 10) || 0;
      const wStr = weekStr || "";
      const weekMatch = wStr.match(weekRegex);

      let readableWeek = wStr || "?";
      
      // If it looks like a standard YYYY-MM-DD date, just format it
      if (/^\d{4}-\d{2}-\d{2}$/.test(wStr)) {
        readableWeek = wStr.substring(5).replace('-', '/'); // MM/DD
      } else if (weekMatch) {
        readableWeek = `Week ${parseInt(weekMatch[2], 10)}`;
      }

      return { value, weekId: wStr, readableWeek };
    });
}

/**
 * PREDICTION ENGINE: WEIGHTED DECAY
 * Calculates a projected score using a 10-week linear decay weighted average.
 *
 * @remarks
 * Architectural Context:
 * - Layer: Layer 1 (@core/utils)
 * - Satisfies ADR Section I: Core Utilities.
 *
 * [DECISION LOG] WEIGHTED DECAY STRATEGY
 * Rationale: Historical performance is a lagging indicator. Recent performance
 * is more predictive of future outcomes than distant history.
 * - Slope: Weights start at 1.0 (100%) and decrement by 0.05 (5%) per week.
 * - Floor: Weights floor at 0.5 (50%) to ensure old data still contributes
 *   to the baseline without overwhelming recent trends.
 *
 * @param historyScores - Array of numeric scores, ordered most-recent first.
 * @param maxScore - The ceiling for the calculated prediction.
 * @returns The projected score, clamped between 0 and maxScore.
 */
export function calculatePrediction(historyScores: number[], maxScore: number): number {
  const n = historyScores.length;
  if (n === 0) return 0;

  let totalWeightedScore = 0;
  let totalWeights = 0;

  for (let i = 0; i < n; i++) {
    // i=0 is most recent
    // [DECISION LOG] Weight Calculation: Weight = max(0.5, 1.0 - (i * 0.05))
    // This ensures a 10-week linear ramp before hitting the 50% floor.
    const weight = Math.max(0.5, 1.0 - (i * 0.05));
    totalWeightedScore += historyScores[i] * weight;
    totalWeights += weight;
  }

  const projection = totalWeights > 0 ? totalWeightedScore / totalWeights : 0;
  
  return Math.max(0, Math.min(maxScore, projection));
}
