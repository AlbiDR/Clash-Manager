// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * LABORATORY - Game Registry & Calibration (Layer 3)
 * ----------------------------------------------------------------------------
 * Rationale: Central source of truth for all Clash Royale game constants,
 * costs, and XP tables used by the Laboratory simulation engine.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * Architectural Context:
 * - Layer: Layer 3 (@features)
 * - Import Boundaries: Restricted to Layer 1 (@core) and Layer 2 (@shared).
 *   Imports from Layer 4 (@app) or other Features are strictly forbidden.
 */

import type { Rarity } from './Types';
import { asGold, asXP, asGems, addGems, type Gold, type XP, type Gems } from '@core/utils/economy';

/**
 * The maximum level any card can achieve in the current game version.
 */
export const CARD_LEVEL_CAP = 16;

/**
 * The starting level for each card rarity.
 * Rationale: Used to normalize relative levels (1-14) to absolute game levels.
 */
export const CARD_RARITY_START_LEVELS: Readonly<Record<Rarity, number>> = {
  "Common": 1,
  "Rare": 3,
  "Epic": 6,
  "Legendary": 9,
  "Champion": 11
};

// --- Logic Calibration (Engine 2.3) ---

/**
 * The weight factor applied to future steps during Recursive Chain Lookahead.
 * Higher values make the engine more "farsighted" but increase sensitivity to
 * deep-chain local optima.
 */
export const LOOKAHEAD_WEIGHT = 0.4;

/**
 * The threshold at which the Recursive Chain Lookahead stops.
 * Rationale: Principled convergence ensures the engine doesn't waste cycles on
 * statistically insignificant future weights.
 */
export const LOOKAHEAD_PRECISION = 0.01;

/**
 * Gold costs required for each level upgrade, per rarity.
 * Key: Rarity -> Target Level -> Gold amount.
 *
 * Rationale: Gold costs are NOT uniform across rarities at the same absolute
 * level. A rarity's first upgrade costs less than what Common pays at that
 * level because it reflects fewer cumulative upgrade steps. Discrepancies
 * verified against the reference progression calculator (2026 update):
 *   - Epic   L7: 400g  (not 1000g — it is Epic's first upgrade step)
 *   - Legendary L10: 5000g (not 8000g — it is Legendary's first upgrade step)
 */
export const GOLD_COST_TABLE: Readonly<Record<Rarity, Readonly<Record<number, Gold>>>> = {
  "Common": {
    2: asGold(5),     3: asGold(20),    4: asGold(50),    5: asGold(150),
    6: asGold(400),   7: asGold(1000),  8: asGold(2000),  9: asGold(4000),
    10: asGold(8000), 11: asGold(15000),12: asGold(25000), 13: asGold(40000),
    14: asGold(60000),15: asGold(90000),16: asGold(120000)
  },
  "Rare": {
    4: asGold(50),    5: asGold(150),   6: asGold(400),   7: asGold(1000),
    8: asGold(2000),  9: asGold(4000),  10: asGold(8000), 11: asGold(15000),
    12: asGold(25000),13: asGold(40000),14: asGold(60000), 15: asGold(90000),
    16: asGold(120000)
  },
  "Epic": {
    // L7 is Epic's first upgrade step — costs 400g, not 1000g.
    7: asGold(400),   8: asGold(2000),  9: asGold(4000),  10: asGold(8000),
    11: asGold(15000),12: asGold(25000),13: asGold(40000), 14: asGold(60000),
    15: asGold(90000),16: asGold(120000)
  },
  "Legendary": {
    // L10 is Legendary's first upgrade step — costs 5000g, not 8000g.
    10: asGold(5000), 11: asGold(15000),12: asGold(25000), 13: asGold(40000),
    14: asGold(60000),15: asGold(90000),16: asGold(120000)
  },
  "Champion": {
    12: asGold(25000),13: asGold(40000),14: asGold(60000),
    15: asGold(90000),16: asGold(120000)
  }
};

/**
 * Experience points (XP) gained for each level upgrade.
 * Key: Target Level.
 * Value: XP amount.
 */
export const CARD_XP_TABLE: Readonly<Record<number, XP>> = {
  2: asXP(4), 3: asXP(5), 4: asXP(6), 5: asXP(10), 6: asXP(25), 7: asXP(50), 8: asXP(100),
  9: asXP(200), 10: asXP(400), 11: asXP(600), 12: asXP(800), 13: asXP(1600), 14: asXP(2000), 15: asXP(50000), 16: asXP(200000)
};

/**
 * Required card counts for each level upgrade, categorized by rarity.
 * Key: Rarity -> Target Level -> Required Count.
 */
export const MATERIAL_REQUIREMENTS: Readonly<Record<Rarity, Readonly<Record<number, number>>>> = {
  "Common": {
    2: 2, 3: 4, 4: 10, 5: 20, 6: 50, 7: 100, 8: 200, 9: 400, 10: 800,
    11: 1000, 12: 1500, 13: 2500, 14: 3500, 15: 5500, 16: 7500
  },
  "Rare": {
    4: 2, 5: 4, 6: 10, 7: 20, 8: 50, 9: 100, 10: 200, 11: 300, 12: 400,
    13: 550, 14: 750, 15: 1000, 16: 1400
  },
  "Epic": {
    7: 2, 8: 4, 9: 10, 10: 20, 11: 30, 12: 50, 13: 70, 14: 100, 15: 130, 16: 180
  },
  "Legendary": {
    10: 2, 11: 4, 12: 6, 13: 9, 14: 12, 15: 14, 16: 20
  },
  "Champion": {
    12: 2, 13: 5, 14: 8, 15: 11, 16: 15
  }
};

/**
 * Gem-to-Card conversion rates used when 'Allow Gem Spending' is enabled.
 * Rationale: Represents the market value of a single card unit in Gems.
 */
export const GEM_CONVERSION_RATES: Readonly<Record<Rarity, number>> = {
  "Common": 0.36,
  "Rare": 2.14,
  "Epic": 21.666666667,
  "Legendary": 210.0,
  "Champion": 400.0
};

/**
 * Cumulative XP requirements for each King Level (Account Level).
 * Rationale: Used to project the player's account level after a series of upgrades.
 */
export const KING_XP_TABLE: ReadonlyArray<KingXpRow> = [
  { level: 1, cumulative: asXP(0) },
  { level: 2, cumulative: asXP(20) },
  { level: 3, cumulative: asXP(70) },
  { level: 4, cumulative: asXP(120) },
  { level: 5, cumulative: asXP(170) },
  { level: 6, cumulative: asXP(250) },
  { level: 7, cumulative: asXP(370) },
  { level: 8, cumulative: asXP(495) },
  { level: 9, cumulative: asXP(625) },
  { level: 10, cumulative: asXP(770) },
  { level: 11, cumulative: asXP(970) },
  { level: 12, cumulative: asXP(1190) },
  { level: 13, cumulative: asXP(1470) },
  { level: 14, cumulative: asXP(1770) },
  { level: 15, cumulative: asXP(2120) },
  { level: 16, cumulative: asXP(2570) },
  { level: 17, cumulative: asXP(3120) },
  { level: 18, cumulative: asXP(3770) },
  { level: 19, cumulative: asXP(4570) },
  { level: 20, cumulative: asXP(5770) },
  { level: 21, cumulative: asXP(7170) },
  { level: 22, cumulative: asXP(8770) },
  { level: 23, cumulative: asXP(10770) },
  { level: 24, cumulative: asXP(13070) },
  { level: 25, cumulative: asXP(15770) },
  { level: 26, cumulative: asXP(18770) },
  { level: 27, cumulative: asXP(22770) },
  { level: 28, cumulative: asXP(27370) },
  { level: 29, cumulative: asXP(32770) },
  { level: 30, cumulative: asXP(38770) },
  { level: 31, cumulative: asXP(45770) },
  { level: 32, cumulative: asXP(53770) },
  { level: 33, cumulative: asXP(62770) },
  { level: 34, cumulative: asXP(73770) },
  { level: 35, cumulative: asXP(86270) },
  { level: 36, cumulative: asXP(98770) },
  { level: 37, cumulative: asXP(111270) },
  { level: 38, cumulative: asXP(123770) },
  { level: 39, cumulative: asXP(138770) },
  { level: 40, cumulative: asXP(156770) },
  { level: 41, cumulative: asXP(178770) },
  { level: 42, cumulative: asXP(203770) },
  { level: 43, cumulative: asXP(228770) },
  { level: 44, cumulative: asXP(253770) },
  { level: 45, cumulative: asXP(278770) },
  { level: 46, cumulative: asXP(303770) },
  { level: 47, cumulative: asXP(328770) },
  { level: 48, cumulative: asXP(353770) },
  { level: 49, cumulative: asXP(378770) },
  { level: 50, cumulative: asXP(403770) },
  { level: 51, cumulative: asXP(428770) },
  { level: 52, cumulative: asXP(468770) },
  { level: 53, cumulative: asXP(523770) },
  { level: 54, cumulative: asXP(593770) },
  { level: 55, cumulative: asXP(678770) },
  { level: 56, cumulative: asXP(778770) },
  { level: 57, cumulative: asXP(893770) },
  { level: 58, cumulative: asXP(1023770) },
  { level: 59, cumulative: asXP(1168770) },
  { level: 60, cumulative: asXP(1328770) },
  { level: 61, cumulative: asXP(1508770) },
  { level: 62, cumulative: asXP(1708770) },
  { level: 63, cumulative: asXP(1928770) },
  { level: 64, cumulative: asXP(2168770) },
  { level: 65, cumulative: asXP(2428770) },
  { level: 66, cumulative: asXP(2708770) },
  { level: 67, cumulative: asXP(3008770) },
  { level: 68, cumulative: asXP(3328770) },
  { level: 69, cumulative: asXP(3668770) },
  { level: 70, cumulative: asXP(4028770) },
  { level: 71, cumulative: asXP(4418770) },
  { level: 72, cumulative: asXP(4838770) },
  { level: 73, cumulative: asXP(5288770) },
  { level: 74, cumulative: asXP(5838770) },
  { level: 75, cumulative: asXP(6438770) },
  { level: 76, cumulative: asXP(7138770) },
  { level: 77, cumulative: asXP(7938770) },
  { level: 78, cumulative: asXP(8838770) },
  { level: 79, cumulative: asXP(9838770) },
  { level: 80, cumulative: asXP(10938770) },
  { level: 81, cumulative: asXP(12138770) },
  { level: 82, cumulative: asXP(13438770) },
  { level: 83, cumulative: asXP(14838770) },
  { level: 84, cumulative: asXP(16338770) },
  { level: 85, cumulative: asXP(17938770) },
  { level: 86, cumulative: asXP(19638770) },
  { level: 87, cumulative: asXP(21438770) },
  { level: 88, cumulative: asXP(23338770) },
  { level: 89, cumulative: asXP(25338770) },
  { level: 90, cumulative: asXP(27438770) },
];

/**
 * Key milestones for King Level projection.
 * Rationale: Represents levels where significant game features or rewards are unlocked.
 */
export const IMPORTANT_KING_LEVELS: ReadonlyArray<number> = [
  2, 3, 5, 7, 10, 14, 18, 22, 26, 30, 34, 38, 42, 46, 50, 54, 58, 62, 66, 70, 75, 80, 85, 90
];

/**
 * Specific efficiency overrides for individual cards.
 * Rationale: Allows manual calibration for cards that provide abnormal value
 * relative to their level (e.g., Champions or recently buffed cards).
 */
export const EFFICIENCY_OVERRIDES: Readonly<Record<string, number>> = {
  // Add specific card overrides here if necessary
};

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

/**
 * Atomic data bundle for a specific card upgrade.
 */
export interface UpgradeData {
  readonly cardsRequired: number;
  readonly goldCost: Gold;
  readonly xpGain: XP;
}

/**
 * Retrieves costs and gains for a card upgrade.
 *
 * @param rarity - The card rarity.
 * @param targetLevel - The level being upgraded to.
 * @returns UpgradeData if level exists, otherwise null.
 */
export function getUpgradeData(rarity: Rarity, targetLevel: number): UpgradeData | null {
  const cardsRequired = MATERIAL_REQUIREMENTS[rarity][targetLevel];
  const goldCost = GOLD_COST_TABLE[targetLevel];
  const xpGain = CARD_XP_TABLE[targetLevel];

  if (cardsRequired === undefined || goldCost === undefined || xpGain === undefined) {
    return null;
  }

  return { cardsRequired, goldCost, xpGain };
}
