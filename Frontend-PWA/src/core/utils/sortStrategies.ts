// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import type { LeaderboardMember, Recruit } from "@core/types";
import { parseTimeAgoValue } from "./formatters";

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
 * @param a - First item with a name property ('n').
 * @param b - Second item with a name property ('n').
 * @returns Standard comparator result (-1, 0, 1).
 */
export const sortByName = (a: { n: string }, b: { n: string }) =>
  a.n.localeCompare(b.n);

/**
 * Performs a descending sort by trophies.
 *
 * @param a - First item with a trophies property ('t').
 * @param b - Second item with a trophies property ('t').
 * @returns Standard comparator result.
 */
export const sortByTrophies = (a: { t: number }, b: { t: number }) =>
  (b.t || 0) - (a.t || 0);

/**
 * Performs a descending hybrid score sort (Performance or Potential).
 *
 * @remarks
 * Implements a two-tier comparison:
 * 1. Normalized Score (0-100): The primary sort key.
 * 2. Raw Score: Used as a high-precision tie-breaker when normalized scores match.
 *
 * @param a - First item with score properties.
 * @param b - Second item with score properties.
 * @returns Standard comparator result.
 */
export const sortByScore = (
  a: { score?: number; rawScore?: number },
  b: { score?: number; rawScore?: number },
) => {
  const diff = (b.score || 0) - (a.score || 0);
  if (diff !== 0) return diff;
  return (b.rawScore || 0) - (a.rawScore || 0);
};

/**
 * Performs an ascending sort by "Last Seen" recency (Newest first).
 *
 * @remarks
 * Utilizes `parseTimeAgoValue` to convert human-readable time strings into
 * numeric minutes for O(1) comparison.
 *
 * @param a - First item with nested recency data.
 * @param b - Second item with nested recency data.
 * @returns Standard comparator result.
 */
export const sortByLastSeen = (
  a: { d: { seen?: string; ago?: string } },
  b: { d: { seen?: string; ago?: string } },
) => {
  const valA = a.d.seen || a.d.ago;
  const valB = b.d.seen || b.d.ago;
  return parseTimeAgoValue(valA) - parseTimeAgoValue(valB);
};

/**
 * Registry of sort strategies specifically for the Leaderboard (Roster).
 */
export const LeaderboardSort = {
  score: (a: LeaderboardMember, b: LeaderboardMember) =>
    sortByScore(
      { score: a.performanceScore, rawScore: a.performanceRawScore },
      { score: b.performanceScore, rawScore: b.performanceRawScore }
    ),
  trend: (a: LeaderboardMember, b: LeaderboardMember) => (b.dt || 0) - (a.dt || 0),
  trophies: sortByTrophies,
  name: sortByName,
  donations_day: (a: LeaderboardMember, b: LeaderboardMember) => (b.d.avg || 0) - (a.d.avg || 0),
  tenure: (a: LeaderboardMember, b: LeaderboardMember) => (b.d.days || 0) - (a.d.days || 0),
  last_seen: sortByLastSeen,
};

/**
 * Registry of sort strategies specifically for the Recruiter (Headhunter).
 */
export const RecruiterSort = {
  score: (a: Recruit, b: Recruit) =>
    sortByScore(
      { score: a.potentialScore, rawScore: a.potentialRawScore },
      { score: b.potentialScore, rawScore: b.potentialRawScore }
    ),
  trophies: sortByTrophies,
  name: sortByName,
  time_found: (a: Recruit, b: Recruit) => parseTimeAgoValue(a.d.ago) - parseTimeAgoValue(b.d.ago),
  donations: (a: Recruit, b: Recruit) => (b.d.don || 0) - (a.d.don || 0),
};
