// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * ============================================================================
 * MODULE: WAR MATHEMATICS (Prediction Engine)
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Provides mathematical utilities for analyzing historical war
 * performance and projecting future outcomes.
 *
 * ARCHITECTURE:
 *    - Layer: Layer 1 (@core)
 *    - Recency Bias: Uses weighted averages where newer weeks carry more
 *      influence than older weeks (Exponential Decay approximation).
 *    - Form Modifiers: Applies conditional bonuses (Streaks) to account for
 *      psychological or tactical momentum not captured by raw averages.
 *
 * ROLE: Part of the "Persistent Clan Database" strategy, transforming raw
 * archived snapshots into actionable performance forecasts.
 *
 * IMPORT BOUNDARIES:
 * - Terminal leaf in the dependency graph. Must NOT import from any other
 *   services or features.
 * ============================================================================
 */

/**
 * Core constants for war scoring and validation.
 */
export const WAR_CONSTANTS = {
  /** Maximum fame achievable in a single war week. */
  MAX_FAME: 3200,
  /** Minimum fame required to be considered a 'win' for streak calculations. */
  WIN_THRESHOLD: 2000,
  /** Fixed bonus added to predictions for members on a 3-week winning streak. */
  STREAK_BONUS: 160,
};

/**
 * Weighting distributions for historical lookbacks.
 *
 * @remarks
 * The weights follow a 'Recency Bias' principle. For any given lookback
 * window (1-5 weeks), the most recent week (index 0) is assigned the
 * highest significance. This ensures the prediction adapts quickly to
 * sudden changes in player activity while still maintaining a stable
 * historical baseline.
 */
const PREDICTION_WEIGHTS: Record<number, number[]> = {
  // // DECISION LOG: Recency Bias Distribution
  // Rationale: We use a steep decay curve (0.4 for the current week vs 0.08 for week 5)
  // to ensure that the prediction reflects current form immediately. This is
  // critical for identifying "burned out" players before their 5-week average
  // drops significantly.
  1: [1.0],
  2: [0.7, 0.3],
  3: [0.6, 0.3, 0.1],
  4: [0.5, 0.25, 0.15, 0.1],
  5: [0.4, 0.25, 0.15, 0.12, 0.08],
};

/**
 * Normalized representation of a historical war entry.
 */
export interface HistoryEntry {
  /** Raw fame points earned in the week. */
  fame: number;
  /** Branded Week ID (e.g., "24W01"). */
  weekId: string;
  /** UI-friendly representation (e.g., "Week 1"). */
  readableWeek: string;
}

/**
 * Transforms the serialized history string into an array of HistoryEntry objects.
 *
 * @param historyStr - A string containing space-separated Fame and Week ID,
 * delimited by pipes or commas (e.g., "3000 24W01 | 2500 24W02").
 *
 * @returns An array of HistoryEntry objects, preserved in the original sort order (Newest -> Oldest).
 *
 * @remarks
 * The parser is resilient to different delimiter styles (pipe or comma) used
 * by various versions of the GAS backend. It utilizes a strict regex for
 * week ID validation (YY'W'WW format).
 *
 * THREAT: Malformed history strings from legacy GAS versions causing UI crashes.
 * Rationale: Explicitly filtering Boolean and trimming ensures that whitespace
 * or trailing delimiters do not result in "undefined" entries in the array.
 */
export function parseHistoryString(
  historyStr: string | undefined,
): HistoryEntry[] {
  // Return empty if no data or placeholder '-' found
  if (!historyStr || historyStr === "-") return [];

  // Regex intent: Match 2 digits (Year), a literal 'W', and 2 digits (Week number)
  const weekRegex = /^(\d{2})W(\d{2})$/;

  return historyStr
    .split(/[|,]/) // Split by pipe or comma
    .map((x) => x.trim())
    .filter(Boolean)
    .map((entry) => {
      const [valStr, weekStr] = entry.split(" ");
      const fame = parseInt(valStr || "0", 10) || 0;
      const wStr = weekStr || "";
      const weekMatch = wStr.match(weekRegex);

      // Transform "24W01" into "Week 1" for UI readability
      const readableWeek = weekMatch
        ? `Week ${parseInt(weekMatch[2], 10)}`
        : wStr || "?";

      return { fame, weekId: wStr, readableWeek };
    });
}

/**
 * Calculates a projected fame score for the upcoming war week.
 *
 * @param fameHistory - Array of raw fame scores, ordered from Newest to Oldest.
 *
 * @returns A predicted fame score, clamped between 0 and MAX_FAME.
 *
 * @remarks
 * The algorithm balances 'Stability' and 'Momentum' through a two-phase calculation:
 * 1. **Baseline Projection**: A weighted average using the PREDICTION_WEIGHTS
 *    table (max 5-week lookback). Newer data has exponentially higher impact.
 * 2. **Form Modifier (Streak Bonus)**: If a member has exceeded the WIN_THRESHOLD
 *    for 3 consecutive weeks, they receive a fixed bonus to represent their
 *    high-momentum 'hot' form.
 */
export function calculatePrediction(fameHistory: number[]): number {
  const n = fameHistory.length;
  if (n === 0) return 0;

  // PHASE 1: Baseline Calculation (Weighted History)
  // We limit lookback to 5 weeks to prevent legacy data from skewing current form.
  const lookbackCount = Math.min(n, 5);
  const ratios = PREDICTION_WEIGHTS[lookbackCount] || [1.0];

  let projection = 0;

  for (let i = 0; i < ratios.length; i++) {
    // Safety check for sparse arrays
    if (fameHistory[i] !== undefined) {
      projection += fameHistory[i] * ratios[i];
    }
  }

  // PHASE 2: Form Modifier (Streak Bonus)
  // // DECISION LOG: Streak Momentum Logic
  // Rationale: A 3-week winning streak is a strong indicator of both high
  // participation and tactical proficiency. The 160pt (5% of MAX) bonus
  // provides a slight "edge" to reliable performers in the Roster view rankings.
  if (n >= 3) {
    if (
      fameHistory[0] > WAR_CONSTANTS.WIN_THRESHOLD &&
      fameHistory[1] > WAR_CONSTANTS.WIN_THRESHOLD &&
      fameHistory[2] > WAR_CONSTANTS.WIN_THRESHOLD
    ) {
      projection += WAR_CONSTANTS.STREAK_BONUS;
    }
  }

  // FINAL: Result Normalization
  // // THREAT: Prediction overflow.
  // Rationale: Weighted averages + bonuses can mathematically exceed 3200.
  // We clamp to MAX_FAME to maintain physical game parity in the UI.
  return Math.max(0, Math.min(WAR_CONSTANTS.MAX_FAME, projection));
}
