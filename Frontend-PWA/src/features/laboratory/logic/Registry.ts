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
import { asGold, asXP, type Gold, type XP } from '@core/utils/economy';

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
 * Gold costs required for each level upgrade.
 * Key: Target Level.
 * Value: Gold amount.
 */
export const GOLD_COST_TABLE: Readonly<Record<number, Gold>> = {
  2: asGold(5), 3: asGold(20), 4: asGold(50), 5: asGold(150), 6: asGold(400), 7: asGold(1000), 8: asGold(2000),
  9: asGold(4000), 10: asGold(8000), 11: asGold(15000), 12: asGold(25000), 13: asGold(40000), 14: asGold(60000), 15: asGold(90000), 16: asGold(120000)
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
  { level: 3, cumulative: asXP(50) },
  { level: 4, cumulative: asXP(100) },
  { level: 5, cumulative: asXP(200) },
  { level: 6, cumulative: asXP(400) },
  { level: 7, cumulative: asXP(1000) },
  { level: 8, cumulative: asXP(2000) },
  { level: 9, cumulative: asXP(4000) },
  { level: 10, cumulative: asXP(6000) },
  { level: 11, cumulative: asXP(10000) },
  { level: 12, cumulative: asXP(15000) },
  { level: 13, cumulative: asXP(25000) },
  { level: 14, cumulative: asXP(40000) },
  { level: 15, cumulative: asXP(50000) },
  { level: 16, cumulative: asXP(60000) },
  { level: 17, cumulative: asXP(70000) },
  { level: 18, cumulative: asXP(80000) },
  { level: 19, cumulative: asXP(90000) },
  { level: 20, cumulative: asXP(100000) },
  { level: 21, cumulative: asXP(110000) },
  { level: 22, cumulative: asXP(120000) },
  { level: 23, cumulative: asXP(130000) },
  { level: 24, cumulative: asXP(140000) },
  { level: 25, cumulative: asXP(150000) },
  { level: 26, cumulative: asXP(160000) },
  { level: 27, cumulative: asXP(170000) },
  { level: 28, cumulative: asXP(180000) },
  { level: 29, cumulative: asXP(190000) },
  { level: 30, cumulative: asXP(200000) },
  { level: 31, cumulative: asXP(210000) },
  { level: 32, cumulative: asXP(220000) },
  { level: 33, cumulative: asXP(230000) },
  { level: 34, cumulative: asXP(240000) },
  { level: 35, cumulative: asXP(250000) },
  { level: 36, cumulative: asXP(260000) },
  { level: 37, cumulative: asXP(270000) },
  { level: 38, cumulative: asXP(280000) },
  { level: 39, cumulative: asXP(290000) },
  { level: 40, cumulative: asXP(300000) },
  { level: 41, cumulative: asXP(310000) },
  { level: 42, cumulative: asXP(320000) },
  { level: 43, cumulative: asXP(335000) },
  { level: 44, cumulative: asXP(355000) },
  { level: 45, cumulative: asXP(380000) },
  { level: 46, cumulative: asXP(410000) },
  { level: 47, cumulative: asXP(445000) },
  { level: 48, cumulative: asXP(485000) },
  { level: 49, cumulative: asXP(530000) },
  { level: 50, cumulative: asXP(580000) },
  { level: 51, cumulative: asXP(630000) },
  { level: 52, cumulative: asXP(680000) },
  { level: 53, cumulative: asXP(730000) },
  { level: 54, cumulative: asXP(780000) },
  { level: 55, cumulative: asXP(830000) },
  { level: 56, cumulative: asXP(880000) },
  { level: 57, cumulative: asXP(930000) },
  { level: 58, cumulative: asXP(980000) },
  { level: 59, cumulative: asXP(1030000) },
  { level: 60, cumulative: asXP(1080000) },
  { level: 61, cumulative: asXP(1130000) },
  { level: 62, cumulative: asXP(1180000) },
  { level: 63, cumulative: asXP(1230000) },
  { level: 64, cumulative: asXP(1280000) },
  { level: 65, cumulative: asXP(1330000) },
  { level: 66, cumulative: asXP(1380000) },
  { level: 67, cumulative: asXP(1430000) },
  { level: 68, cumulative: asXP(1480000) },
  { level: 69, cumulative: asXP(1530000) },
  { level: 70, cumulative: asXP(1580000) },
  { level: 71, cumulative: asXP(1630000) },
  { level: 72, cumulative: asXP(1680000) },
  { level: 73, cumulative: asXP(1730000) },
  { level: 74, cumulative: asXP(1780000) },
  { level: 75, cumulative: asXP(1830000) },
  { level: 76, cumulative: asXP(1880000) },
  { level: 77, cumulative: asXP(1930000) },
  { level: 78, cumulative: asXP(1980000) },
  { level: 79, cumulative: asXP(2030000) },
  { level: 80, cumulative: asXP(2080000) },
  { level: 81, cumulative: asXP(2130000) },
  { level: 82, cumulative: asXP(2180000) },
  { level: 83, cumulative: asXP(2230000) },
  { level: 84, cumulative: asXP(2280000) },
  { level: 85, cumulative: asXP(2330000) },
  { level: 86, cumulative: asXP(2380000) },
  { level: 87, cumulative: asXP(2430000) },
  { level: 88, cumulative: asXP(2480000) },
  { level: 89, cumulative: asXP(2530000) },
  { level: 90, cumulative: asXP(2580000) }
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
