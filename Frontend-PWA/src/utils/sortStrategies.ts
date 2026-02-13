import type { LeaderboardMember, Recruit } from "../types";
import { parseTimeAgoValue } from "./formatters";

/**
 * SHARED SORT STRATEGIES
 *
 * Centralized sorting logic for Leaderboard and Recruiter views.
 * Ensures consistent sorting behavior across the application.
 */

export const LEADERBOARD_SORT_STRATEGIES: Record<
  string,
  (a: LeaderboardMember, b: LeaderboardMember) => number
> = {
  score: (a, b) => (b.performanceScore || 0) - (a.performanceScore || 0),
  trend: (a, b) => (b.dt || 0) - (a.dt || 0),
  trophies: (a, b) => (b.t || 0) - (a.t || 0),
  name: (a, b) => a.n.localeCompare(b.n),
  donations_day: (a, b) => (b.d.avg || 0) - (a.d.avg || 0),
  tenure: (a, b) => (b.d.days || 0) - (a.d.days || 0),
  last_seen: (a, b) =>
    parseTimeAgoValue(a.d.seen) - parseTimeAgoValue(b.d.seen),
};

export const RECRUITER_SORT_STRATEGIES: Record<
  string,
  (a: Recruit, b: Recruit) => number
> = {
  score: (a, b) => (b.potentialScore || 0) - (a.potentialScore || 0),
  trophies: (a, b) => (b.t || 0) - (a.t || 0),
  name: (a, b) => a.n.localeCompare(b.n),
  time_found: (a, b) =>
    parseTimeAgoValue(a.d.ago) - parseTimeAgoValue(b.d.ago),
  donations: (a, b) => (b.d.don || 0) - (a.d.don || 0),
};
