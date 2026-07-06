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

/**
 * Normalizes a player or clan tag to a standard uppercase format with a hash prefix.
 *
 * @remarks
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
 * Calculates the Raw Recruiter Point of Satisfaction (RPoS) score for a player.
 *
 * @remarks
 * [DECISION LOG] RPoS (Raw Potential Score) CALCULATION:
 * Authoritative formula: Trophies(1x) + Donations(0.1x) + (WarWins+500)*20
 * This formula prioritizes war experience as the primary indicator of value,
 * using Trophies and Donations as stability markers. The +500 offset on
 * WarWins ensures a base competitive score for all candidates.
 *
 * @param trophies - Current trophy count.
 * @param donations - Lifetime donation count.
 * @param warWins - Total war day wins.
 * @returns The calculated RPoS score.
 */
export function calculateRpos(trophies: number, donations: number, warWins: number): number {
  return (trophies * 1.0) + (donations * 0.1) + ((warWins + 500) * 20.0);
}
