// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * L1 Core: Backend Utilities (@shared)
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Centralized normalization and text processing utilities.
 *
 * ARCHITECTURE:
 *    - Stateless: All functions are pure and rely only on inputs.
 * ============================================================================
 */

import {
  RPOS_TROPHY_WEIGHT,
  RPOS_DONATION_WEIGHT,
  RPOS_WIN_RATE_RATIO,
  RPOS_THREE_CROWN_MULT,
  RPOS_LEGACY_WAR_WEIGHT,
  RPOS_CHALLENGE_CARD_WEIGHT,
  RPOS_CHALLENGE_CARD_CAP,
  RPOS_GC_BONUS_RATIO,
  GRAND_CHALLENGE_WIN_THRESHOLD,
} from "./config.ts";

/**
 * Normalizes a player or clan tag to a standard uppercase format with a hash prefix.
 *
 * @remarks
 * Satisfies ADR Section VII: Naming Conventions (Identifiers).
 * [DECISION LOG] Ensuring all tags used across the backend substrate are
 * consistent to maximize cache hits and prevent duplicate database entries.
 *
 * @param tag - The raw tag from the request or external API.
 * @returns A normalized, uppercase tag string with the '#' prefix.
 */
export function normalizeTag(tag: string): string {
  const cleanedTag = tag.trim().toUpperCase();
  return cleanedTag.startsWith("#") ? cleanedTag : `#${cleanedTag}`;
}

/**
 * Maps raw rarity strings from the Royale API to standardized title-case names.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 * [DECISION LOG] The Royale API returns lowercase rarities. We standardize
 * these to Title Case to match our relational schema and UI expectations.
 *
 * @param rawRarity - The raw rarity string from the Royale API (e.g., "common").
 * @returns A standardized Title-Case rarity name.
 */
export function normalizeRarity(rawRarity: string): string {
  const rarityMap: Record<string, string> = {
    common: "Common",
    rare: "Rare",
    epic: "Epic",
    legendary: "Legendary",
    champion: "Champion",
  };
  return rarityMap[rawRarity?.toLowerCase()?.trim()] ?? "Common";
}

/**
 * Input parameters for calculateRpos().
 *
 * @remarks
 * [DECISION LOG] A single params object replaces the old positional
 * `(trophies, donations, warWins)` signature now that the formula has grown
 * to 8 inputs; positional arguments at this arity are error-prone to call
 * correctly and to reorder safely.
 *
 * Property names follow the noun_role snake_case convention mandated for
 * `@core`/`@shared` backend logic kernel parameters. This is strictly an
 * internal TypeScript naming choice: no database column, API payload shape,
 * or CR API field name changes as a result. `trophies`, `wins`,
 * `battle_count`, and `three_crown_wins` keep their plain, already-unambiguous
 * names.
 */
export interface CalculateRposParams {
  /** Current trophy count (CR API `trophies`). */
  trophies: number;
  /**
   * Lifetime career donation total (CR API `totalDonations`). This is NOT
   * the weekly `drivers.members.donations` column, which resets weekly and
   * reads 0-1,000; `lifetime_donations` values typically run 20,000-350,000
   * for active veteran players.
   */
  lifetime_donations: number;
  /**
   * Legacy Clan Wars 1 (CW1) war day wins (CR API `warDayWins`). Frozen since
   * CW1 retired on 2020-08-31, so this is 0 for every player who started
   * after that date and non-zero only for long-tenured veterans.
   */
  legacy_war_wins: number;
  /** Lifetime PvP wins across all modes (CR API `wins`). */
  wins: number;
  /** Lifetime battles played across all modes (CR API `battleCount`). */
  battle_count: number;
  /** Lifetime three-crown wins (CR API `threeCrownWins`). */
  three_crown_wins: number;
  /** Lifetime cards won inside challenges only (CR API `challengeCardsWon`). */
  challenge_cards_won: number;
  /** Personal best consecutive wins in a single challenge (CR API `challengeMaxWins`). */
  challenge_max_wins: number;
}

/**
 * Computes the weighted win rate: the primary quality signal in the RPoS
 * formula, replacing the frozen legacy war day win metric.
 *
 * @remarks
 * Satisfies ADR Section III: Business Logic Kernels.
 *
 * [DECISION LOG] Three-crown wins represent a dominant, full-tower victory
 * and are injected directly into the numerator at RPOS_THREE_CROWN_MULT
 * instead of counting as a standard win, so decisive play is rewarded over a
 * narrow one.
 *
 * [DECISION LOG] There is deliberately no minimum-battle-count floor. An
 * earlier design proposed `MIN_BATTLE_COUNT_FOR_WIN_RATE`, a hard cutoff
 * below which this ratio would contribute 0, reasoning that a low battle
 * count makes the ratio statistically noisy. That was rejected: a fixed
 * floor is itself a magic number, and it actively breaks in a clan whose
 * recruit pool skews new, zeroing out the primary signal for the entire
 * cohort. The only guard here is division-by-zero, so an unplayed profile
 * (`battle_count` of 0) returns 0 rather than `NaN`. The trophy weight term
 * in calculateRpos() already anchors the overall score to the player's
 * actual level, so a low-battle-count player with an extreme ratio cannot
 * get an outsized boost unless their trophies support it too.
 *
 * Exported, rather than kept as a private helper of calculateRpos(), because
 * `headhunter-scanner/stages/profiler.ts` and
 * `headhunter-scanner/stages/rescan.ts` also call this directly to compute
 * the value persisted to the new `drivers.recruits.win_rate` column.
 *
 * @param wins - Lifetime PvP wins across all modes (CR API `wins`).
 * @param battle_count - Lifetime battles played across all modes (CR API `battleCount`).
 * @param three_crown_wins - Lifetime three-crown wins (CR API `threeCrownWins`).
 * @returns The weighted win rate ratio, or 0 when `battle_count` is 0.
 */
export function calculateWeightedWinRate(wins: number, battle_count: number, three_crown_wins: number): number {
  const performanceWins = (wins - three_crown_wins) + (three_crown_wins * RPOS_THREE_CROWN_MULT);
  return battle_count > 0 ? performanceWins / battle_count : 0;
}

/**
 * Calculates the Raw Potential Score (RPoS) for a recruit candidate.
 *
 * @remarks
 * Satisfies ADR Section III: Business Logic Kernels.
 *
 * [DECISION LOG] The previous formula was
 * `trophies + donations * 0.1 + (warDayWins + 500) * 20`. The `+500` offset
 * on `warDayWins` was designed when Clan Wars 1 was live and `warDayWins`
 * routinely carried values of 100-500+, where it acted as a mild floor boost
 * on top of real war wins. `warDayWins` has been frozen since CW1 retired on
 * 2020-08-31, so for any player who started afterward the term evaluates to
 * `(0 + 500) * 20 = 10000`: a flat, universal inflation with zero
 * differentiating signal. That 10,000 was a bug, not an intentional base
 * score, and this rewrite removes it entirely. There is no
 * `RPOS_BASE_SCORE`: an all-zero-input call returns exactly 0.
 *
 * [DECISION LOG] Weighted win rate (see calculateWeightedWinRate()) replaces
 * `legacy_war_wins` as the primary quality signal, since it is a live,
 * growing metric available to every player regardless of CW1 tenure.
 * `legacy_war_wins` is retained only as a small veteran micro-bonus with no
 * offset: 0 contributes exactly 0.
 *
 * [DECISION LOG] The win rate weight is not a stored `config.ts` constant.
 * It is computed inline as `(trophies * RPOS_TROPHY_WEIGHT) * RPOS_WIN_RATE_RATIO`
 * so the win rate component scales with the player's own trophy level
 * instead of one fixed weight that overvalues low-trophy profiles or
 * undervalues high-trophy ones. The Grand Challenge bonus is derived from
 * this same adaptive weight (`* RPOS_GC_BONUS_RATIO`) so it rescales
 * automatically whenever the win rate weight is retuned.
 *
 * [DECISION LOG] `lifetime_donations` binds to the CR API profile's
 * `totalDonations` (lifetime career total), NOT the weekly
 * `drivers.members.donations` column, which resets weekly and reads
 * 0-1,000. `drivers.members` does not carry `totalDonations` for active
 * members because the clan members ingest endpoint does not return lifetime
 * stats; only the full profile fetch used during recruit scanning does.
 *
 * @param params - See CalculateRposParams.
 * @returns The calculated RPoS score.
 */
export function calculateRpos(params: CalculateRposParams): number {
  const {
    trophies,
    lifetime_donations,
    legacy_war_wins,
    wins,
    battle_count,
    three_crown_wins,
    challenge_cards_won,
    challenge_max_wins,
  } = params;

  const weightedWinRate = calculateWeightedWinRate(wins, battle_count, three_crown_wins);
  const winRateWeight = (trophies * RPOS_TROPHY_WEIGHT) * RPOS_WIN_RATE_RATIO;
  const cappedChallengeCards = Math.min(challenge_cards_won, RPOS_CHALLENGE_CARD_CAP);
  const grandChallengeBonus =
    challenge_max_wins >= GRAND_CHALLENGE_WIN_THRESHOLD ? winRateWeight * RPOS_GC_BONUS_RATIO : 0;

  return (
    trophies * RPOS_TROPHY_WEIGHT +
    lifetime_donations * RPOS_DONATION_WEIGHT +
    weightedWinRate * winRateWeight +
    legacy_war_wins * RPOS_LEGACY_WAR_WEIGHT +
    cappedChallengeCards * RPOS_CHALLENGE_CARD_WEIGHT +
    grandChallengeBonus
  );
}
