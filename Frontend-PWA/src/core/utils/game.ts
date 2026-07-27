// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * GAME - Core Clash Royale Domain Logic (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Central source of truth for all Clash Royale game constants,
 * costs, and XP tables. This is the agnostic substrate used by all features.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * Architectural Context:
 * - Layer: Layer 1 (@core)
 * - Import Boundaries: Zero dependencies on higher layers.
 */

import { asXP, asGems, addXP, type XP, type Gems } from './economy';
import {
  CARD_LEVEL_CAP,
  CARD_RARITY_START_LEVELS,
  GOLD_COST_TABLE,
  CARD_XP_TABLE,
  MATERIAL_REQUIREMENTS,
  GEM_CONVERSION_RATES,
  KING_XP_TABLE,
  IMPORTANT_KING_LEVELS
} from './gameConstants';
import type { Rarity, UpgradeData, KingXpRow } from './gameTypes';

// Re-exports for backward compatibility
export * from './gameTypes';
export * from './gameConstants';

/**
 * Retrieves the XP table entry for a specific King Level.
 *
 * @param level - The King Level.
 * @returns The corresponding KingXpRow.
 * @complexity O(1)
 */
export function getKingLevelRow(level: number): KingXpRow {
  return KING_XP_TABLE[level - 1] || KING_XP_TABLE[0];
}

/**
 * Calculates the relative XP into a level from total cumulative XP.
 *
 * @param totalXp - The total cumulative XP.
 * @param level - Optional King Level to calculate progress against. If omitted, derived from totalXp.
 * @returns The relative XP progress into the specified (or derived) level.
 */
export function calculateXpIntoLevel(totalXp: number, level?: number): number {
  const baseLevel = level ?? calculateKingLevel(totalXp);
  const kingLevelRow = getKingLevelRow(baseLevel);
  return Math.max(0, totalXp - Number(kingLevelRow.cumulative));
}

/**
 * Calculates the total cumulative XP from a level and relative progress.
 *
 * @param level - The King Level.
 * @param xpIntoLevel - Relative XP into that level.
 * @returns The total cumulative XP.
 */
export function calculateTotalXp(level: number, xpIntoLevel: number): XP {
  const kingLevelRow = getKingLevelRow(level);
  return addXP(kingLevelRow.cumulative, asXP(xpIntoLevel));
}

/**
 * Determines the King Level (Account Level) based on total XP earned.
 *
 * @param totalXp - The cumulative XP earned from card upgrades.
 * @returns The corresponding King Level from the game tables.
 */
export function calculateKingLevel(totalXp: number): number {
  let low = 0;
  let high = KING_XP_TABLE.length - 1;
  let level = 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (totalXp >= Number(KING_XP_TABLE[mid].cumulative)) {
      level = KING_XP_TABLE[mid].level;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return level;
}

/**
 * Determines the next logical King Level milestone for target projection.
 *
 * @param currentLevel - Current King Level.
 * @returns The next milestone level.
 */
export function calculateDefaultTarget(currentLevel: number): number {
  const nextMilestone = IMPORTANT_KING_LEVELS.find((m) => m > currentLevel);
  return nextMilestone || currentLevel + 1;
}

/**
 * Normalizes a relative card level to its absolute game level.
 *
 * @param level - The relative level (1-14).
 * @param rarity - The card's rarity.
 * @returns The normalized absolute level (1-16).
 */
export function normalizeLevel(level: number, rarity: Rarity): number {
  const offset = (CARD_RARITY_START_LEVELS[rarity] || 1) - 1;
  const absoluteLevel = level + offset;
  return Math.max(1, Math.min(absoluteLevel, CARD_LEVEL_CAP));
}

/**
 * Normalizes a raw rarity string to the domain-compliant Rarity type.
 *
 * @param raw - The raw rarity string.
 * @returns A validated Rarity.
 */
export function normalizeRarity(raw: string): Rarity {
  const lower = raw.toLowerCase().trim();
  const map: Record<string, Rarity> = {
    common: "Common",
    rare: "Rare",
    epic: "Epic",
    legendary: "Legendary",
    champion: "Champion",
  };
  return map[lower] || "Common";
}

/**
 * Retrieves costs and gains for a card upgrade.
 *
 * @param rarity - The card rarity.
 * @param targetLevel - The level being upgraded to.
 * @returns UpgradeData if level exists, otherwise null.
 */
export function getUpgradeData(rarity: Rarity, targetLevel: number): UpgradeData | null {
  const cardsRequired = MATERIAL_REQUIREMENTS[rarity]?.[targetLevel];
  const goldCost = GOLD_COST_TABLE[rarity]?.[targetLevel];
  const xpGain = CARD_XP_TABLE[targetLevel];

  if (cardsRequired === undefined || goldCost === undefined || xpGain === undefined) {
    return null;
  }

  return { cardsRequired, goldCost, xpGain };
}

/**
 * Retrieves the base cumulative XP for a specific King Level.
 *
 * @param level - The King Level.
 * @returns The cumulative XP for that level.
 * @complexity O(1) through direct lookup.
 */
export function getKingLevelBaseXp(level: number): XP {
  const entry = KING_XP_TABLE[level - 1];
  return entry ? entry.cumulative : asXP(0);
}

/**
 * Calculates the Gem cost for a material (card) deficit.
 *
 * @param rarity - The card rarity.
 * @param deficit - The number of cards missing.
 * @returns The cost in Gems, rounded up.
 */
export function calculateGemCostForCards(rarity: Rarity, deficit: number): Gems {
  if (deficit <= 0) return asGems(0);
  const rate = GEM_CONVERSION_RATES[rarity] || 1;
  return asGems(Math.ceil(deficit * rate));
}
