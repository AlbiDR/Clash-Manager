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

export const WAR_CONSTANTS = {
  MAX_FAME: 3600,
};

export const VOYAGE_CONSTANTS = {
  MAX_CROWNS: 250,
};

export interface HistoryEntry {
  value: number; // Generic term, could be fame or crowns
  weekId: string;
  readableWeek: string;
}

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
 * Calculates a projected score using a 10-week linear decay weighted average.
 * Weight starts at 1.0 for the most recent entry and drops by 0.05 each entry,
 * flooring at 0.5.
 */
export function calculatePrediction(historyScores: number[], maxScore: number): number {
  const n = historyScores.length;
  if (n === 0) return 0;

  let totalWeightedScore = 0;
  let totalWeights = 0;

  for (let i = 0; i < n; i++) {
    // i=0 is most recent
    // Weight = max(0.5, 1.0 - (i * 0.05))
    const weight = Math.max(0.5, 1.0 - (i * 0.05));
    totalWeightedScore += historyScores[i] * weight;
    totalWeights += weight;
  }

  const projection = totalWeights > 0 ? totalWeightedScore / totalWeights : 0;
  
  return Math.max(0, Math.min(maxScore, projection));
}
