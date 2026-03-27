/**
 * // SPDX-License-Identifier: GPL-3.0-only
 * // Copyright (C) 2026 AlbiDR
 *
 * SHARED SORT DESCRIPTIONS (Deconstructed v6.8)
 *
 * Centralized documentation for list sorting strategies.
 * Split into 'short' (header summary) and 'full' (overlay details).
 */

export interface SortDescription {
  short: string;
  full: string;
}

export const SORT_DESCRIPTIONS: Record<string, SortDescription> = {
  // --- SHARED ---
  name: {
    short: "Alphabetical ordering by display name.",
    full: "Standard lexical sort by player name. Useful for quickly finding specific members by identity.",
  },

  trophies: {
    short: "Current competitive ranking.",
    full: "**Current competitive ranking** pulled via Supercell API.\n\n**Logic:**\nDirect pull from the most recent snapshot. Reflects 1v1 mechanics and King Tower progression.",
  },

  // --- LEADERBOARD SPECIFIC ---
  performance: {
    short: "Hybrid ranking of reliability and contribution.",
    full: "**Hybrid ranking metric** combining War contribution, donations, and ladder progress.\n\n**Components:**\n• **War Fame**: Both current and average historical contribution.\n• **Donations**: Average daily card support to clanmates.\n• **Progression**: Current trophies and King Tower influence.\n• **Inactivity Decay**: Scoring drops by 10% for every day of absence beyond the grace period.\n\n**Final:** An all-encompassing value reflecting current status and reliability.",
  },

  momentum: {
    short: "Short-term activity velocity.",
    full: "**Factual velocity** representing the change in Raw Score since the last server refresh.\n\n**Logic:**\nΔ Score = [Current Snapshot] − [Last Database Snapshot].\n\n**Context:**\nSnapshots occur approximately every 6 hours. Scaling positive values indicate immediate peaking activity, while negative values suggest declining engagement.",
  },

  donations_day: {
    short: "Average daily card donation rate.",
    full: "**Average daily card donations** during the player's tenure.\n\n**Impact:**\nMeasures social generosity. High donators are vital for the Clan's card leveling economy.",
  },

  tenure: {
    short: "Total membership duration.",
    full: "**Total days within the Clan** for the current membership period.\n\n**Logic:**\nCalculated from the join date stored in the Clan database. High tenure indicates loyalty and consistency.",
  },

  last_seen: {
    short: "Real-time activity proximity.",
    full: "**Player activity timestamp** representing the elapsed time since the last detected in-game interaction.\n\n**Logic:**\nDirect pull from the most recent API snapshot. Values like 'Just now' or '2h ago' indicate immediate presence, while longer durations suggest idling.\n\n**Utility:**\nCritical for identifying active contributors versus members who may be drifting away from engagement.",
  },

  // --- RECRUITER SPECIFIC ---
  potential: {
    short: "Predicted account quality vs Clan baseline.",
    full: "**Suppositional quality score** based on account progression and historical reliability.\n\n**Algorithm:**\nCompares the candidate's account stats against your current Clan baseline (Hybrid Benchmark).\n\n**Signal:**\n'Potential' indicates how well this recruit is expected to perform if they were to join the clan today. Values are strictly capped at 100%.",
  },

  donations_lifetime: {
    short: "Historical donation volume.",
    full: "**Lifetime card donations** from previous Clan history.\n\n**Logic:**\nMeasures long-term generosity.",
  },

  recency: {
    short: "Timestamp of candidate discovery.",
    full: "**Timestamp of discovery** during recent tournament scans. Indicates how fresh the data is.",
  },
} as const;

/**
 * UI SORT OPTIONS: Leaderboard
 */
export const LEADERBOARD_SORT_OPTIONS = [
  { label: "Performance", value: "score", desc: SORT_DESCRIPTIONS.performance.short, fullDesc: SORT_DESCRIPTIONS.performance.full },
  { label: "Momentum", value: "trend", desc: SORT_DESCRIPTIONS.momentum.short, fullDesc: SORT_DESCRIPTIONS.momentum.full },
  { label: "Trophies", value: "trophies", desc: SORT_DESCRIPTIONS.trophies.short, fullDesc: SORT_DESCRIPTIONS.trophies.full },
  { label: "Donations", value: "donations_day", desc: SORT_DESCRIPTIONS.donations_day.short, fullDesc: SORT_DESCRIPTIONS.donations_day.full },
  { label: "Tenure", value: "tenure", desc: SORT_DESCRIPTIONS.tenure.short, fullDesc: SORT_DESCRIPTIONS.tenure.full },
  { label: "Name", value: "name", desc: SORT_DESCRIPTIONS.name.short, fullDesc: SORT_DESCRIPTIONS.name.full },
  { label: "Last Seen", value: "last_seen", desc: SORT_DESCRIPTIONS.last_seen.short, fullDesc: SORT_DESCRIPTIONS.last_seen.full },
];

/**
 * UI SORT OPTIONS: Recruiter
 */
export const RECRUITER_SORT_OPTIONS = [
  { label: "Potential", value: "score", desc: SORT_DESCRIPTIONS.potential.short, fullDesc: SORT_DESCRIPTIONS.potential.full },
  { label: "Trophies", value: "trophies", desc: SORT_DESCRIPTIONS.trophies.short, fullDesc: SORT_DESCRIPTIONS.trophies.full },
  { label: "Donations", value: "donations", desc: SORT_DESCRIPTIONS.donations_lifetime.short, fullDesc: SORT_DESCRIPTIONS.donations_lifetime.full },
  { label: "Recency", value: "time_found", desc: SORT_DESCRIPTIONS.recency.short, fullDesc: SORT_DESCRIPTIONS.recency.full },
  { label: "Name", value: "name", desc: SORT_DESCRIPTIONS.name.short, fullDesc: SORT_DESCRIPTIONS.name.full },
];
