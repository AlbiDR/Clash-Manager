import type { LeaderboardMember, Recruit } from "@core/types";
import { parseTimeAgoValue } from "./formatters";

/**
 * SHARED SORT STRATEGIES
 *
 * Centralized comparator functions for Leaderboard and Recruiter views.
 * Ensures consistent sorting logic across the application.
 */

/**
 * Alphabetical sort by name
 */
export const sortByName = (a: { n: string }, b: { n: string }) =>
  a.n.localeCompare(b.n);

/**
 * Descending sort by trophies
 */
export const sortByTrophies = (a: { t: number }, b: { t: number }) =>
  (b.t || 0) - (a.t || 0);

/**
 * Hybrid Score Sort (Performance or Potential)
 *
 * @remarks
 * Combines the normalized score (0-100) with the raw score as a high-precision tie-breaker.
 */
export const sortByScore = (
  a: { score?: number; rawScore?: number },
  b: { score?: number; rawScore?: number }
) => {
  const diff = (b.score || 0) - (a.score || 0);
  if (diff !== 0) return diff;
  return (b.rawScore || 0) - (a.rawScore || 0);
};

/**
 * Last Seen / Recency Sort
 */
export const sortByLastSeen = (a: { d: { seen?: string; ago?: string } }, b: { d: { seen?: string; ago?: string } }) => {
  const valA = a.d.seen || a.d.ago;
  const valB = b.d.seen || b.d.ago;
  return parseTimeAgoValue(valA) - parseTimeAgoValue(valB);
};

/**
 * LEADERBOARD SPECIFIC STRATEGIES
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
 * RECRUITER SPECIFIC STRATEGIES
 */
export const RecruiterSort = {
  score: (a: Recruit, b: Recruit) =>
    sortByScore(
      { score: a.potentialScore, rawScore: a.potentialRawScore },
      { score: b.potentialScore, rawScore: b.potentialRawScore }
    ),
  trophies: sortByTrophies,
  name: sortByName,
  time_found: sortByLastSeen,
  donations: (a: Recruit, b: Recruit) => (b.d.don || 0) - (a.d.don || 0),
};
