/**
 * SHARED SORT DESCRIPTIONS
 *
 * Centralized documentation for list sorting strategies.
 * Used to ensure consistency across Leaderboard and Recruitment views.
 */

export const SORT_DESCRIPTIONS = {
  // --- SHARED ---
  name: `**Alphabetical ordering** by display name.`,

  trophies: `**Current competitive ranking** pull via Supercell API.\n\n**Logic:**\nDirect pull from the most recent snapshot. Reflects 1v1 mechanics and King Tower progression.`,

  // --- LEADERBOARD SPECIFIC ---
  performance: `**Hybrid ranking metric** combining War contribution, donations, and ladder progress.\n\n**Components:**\n• **War Fame**: Both current and average historical contribution.\n• **Donations**: Average daily card support to clanmates.\n• **Progression**: Current trophies and King Tower influence.\n• **Inactivity Decay**: Scoring drops by 10% for every day of absence beyond the grace period.\n\n**Final:** An all-encompassing value reflecting current status and reliability.`,

  momentum: `**Factual velocity** representing the change in Raw Score since the last server refresh.\n\n**Logic:**\nΔ Score = [Current Snapshot] − [Last Database Snapshot].\n\n**Context:**\nSnapshots occur approximately every 6 hours. Scaling positive values indicate immediate peaking activity, while negative values suggest declining engagement.`,

  donations_day: `**Average daily card donations** during the player's tenure.\n\n**Impact:**\nMeasures social generosity. High donators are vital for the Clan's card leveling economy.`,

  tenure: `**Total days within the Clan** for the current membership period.\n\n**Logic:**\nCalculated from the join date stored in the Clan database. High tenure indicates loyalty and consistency.`,

  last_seen: `**Player activity timestamp** representing the elapsed time since the last detected in-game interaction.\n\n**Logic:**\nDirect pull from the most recent API snapshot. Values like "Just now" or "2h ago" indicate immediate presence, while longer durations suggest idling.\n\n**Utility:**\nCritical for identifying active contributors versus members who may be drifting away from engagement.`,

  // --- RECRUITER SPECIFIC ---
  potential: `**Suppositional quality score** based on account progression and historical reliability.\n\n**Algorithm:**\nCompares the candidate's account stats against your current Clan baseline (Hybrid Benchmark).\n\n**Signal:**\n"Potential" indicates how well this recruit is expected to perform if they were to join the clan today. Values are strictly capped at 100%.`,

  donations_lifetime: `**Lifetime card donations** from previous Clan history.\n\n**Logic:**\nMeasures long-term generosity.`,

  recency: `**Timestamp of discovery** during recent tournament scans.`,
} as const;
