// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import type { LeaderboardMember, Recruit } from "@core/types";
import { parseTimeAgoValue } from "./time";

/**
 * ============================================================================
 * MODULE: SORT STRATEGIES (Layer 1)
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Centralized comparator functions for Leaderboard and Recruiter
 * views. These pure functions define the "Clinical" sort logic of the app.
 *
 * ARCHITECTURE:
 *    - Stateless Comparators: Logic-only functions that do not depend on
 *      higher layers or side effects.
 *    - Hybrid Sorting: Implements multi-tier tie-breaking (e.g., Score -> Raw Score).
 *
 * ROLE: Foundation for data orchestration in RosterView and HeadhunterView.
 * ============================================================================
 */

/**
 * Performs an ascending alphabetical sort by name.
 *
 * @param candidateA - First item with a name property ('n').
 * @param candidateB - Second item with a name property ('n').
 * @returns Standard comparator result (-1, 0, 1).
 */
export const sortByName = (candidateA: { n: string }, candidateB: { n: string }) =>
  candidateA.n.localeCompare(candidateB.n);

/**
 * Performs a descending sort by trophies.
 *
 * @param candidateA - First item with a trophies property ('t').
 * @param candidateB - Second item with a trophies property ('t').
 * @returns Standard comparator result.
 */
export const sortByTrophies = (candidateA: { t: number }, candidateB: { t: number }) =>
  (candidateB.t || 0) - (candidateA.t || 0);

/**
 * Performs a descending hybrid score sort (Performance or Potential).
 *
 * @remarks
 * Implements a two-tier comparison:
 * 1. Normalized Score (0-100): The primary sort key.
 * 2. Raw Score: Used as a high-precision tie-breaker when normalized scores match.
 *
 * @param candidateA - First item with score properties.
 * @param candidateB - Second item with score properties.
 * @returns Standard comparator result.
 */
export const sortByScore = (
  candidateA: { score?: number; rawScore?: number },
  candidateB: { score?: number; rawScore?: number },
) => {
  const scoreDelta = (candidateB.score || 0) - (candidateA.score || 0);
  if (scoreDelta !== 0) return scoreDelta;
  return (candidateB.rawScore || 0) - (candidateA.rawScore || 0);
};

/**
 * Performs an ascending sort by "Last Seen" recency (Newest first).
 *
 * @remarks
 * Utilizes `parseTimeAgoValue` to convert human-readable time strings into
 * numeric minutes for O(1) comparison.
 *
 * @param candidateA - First item with nested recency data.
 * @param candidateB - Second item with nested recency data.
 * @returns Standard comparator result.
 */
export const sortByLastSeen = (
  candidateA: { d: { seen?: string | null; ago?: string } },
  candidateB: { d: { seen?: string | null; ago?: string } },
) => {
  const recencyValueA = candidateA.d.seen || candidateA.d.ago;
  const recencyValueB = candidateB.d.seen || candidateB.d.ago;
  return parseTimeAgoValue(recencyValueA) - parseTimeAgoValue(recencyValueB);
};

/**
 * Registry of sort strategies specifically for the Leaderboard (Roster).
 */
export const LeaderboardSort: Record<string, (a: LeaderboardMember, b: LeaderboardMember) => number> = {
  score: (candidateA: LeaderboardMember, candidateB: LeaderboardMember) =>
    sortByScore(
      { score: candidateA.performanceScore, rawScore: candidateA.performanceRawScore },
      { score: candidateB.performanceScore, rawScore: candidateB.performanceRawScore }
    ),
  trend: (candidateA: LeaderboardMember, candidateB: LeaderboardMember) => (candidateB.dt || 0) - (candidateA.dt || 0),
  trophies: sortByTrophies,
  name: sortByName,
  donations_day: (candidateA: LeaderboardMember, candidateB: LeaderboardMember) => (candidateB.d.avg || 0) - (candidateA.d.avg || 0),
  tenure: (candidateA: LeaderboardMember, candidateB: LeaderboardMember) => (candidateB.d.days || 0) - (candidateA.d.days || 0),
  last_seen: sortByLastSeen,
};

/**
 * Registry of sort strategies specifically for the Recruiter (Headhunter).
 */
export const RecruiterSort = {
  score: (candidateA: Recruit, candidateB: Recruit) =>
    sortByScore(
      { score: candidateA.potentialScore, rawScore: candidateA.potentialRawScore },
      { score: candidateB.potentialScore, rawScore: candidateB.potentialRawScore }
    ),
  trophies: sortByTrophies,
  name: sortByName,
  time_found: (candidateA: Recruit, candidateB: Recruit) => parseTimeAgoValue(candidateA.d.ago) - parseTimeAgoValue(candidateB.d.ago),
  donations: (candidateA: Recruit, candidateB: Recruit) => (candidateB.d.don || 0) - (candidateA.d.don || 0),
};
