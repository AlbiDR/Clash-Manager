// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { type Gold, type XP, type Gems } from './economy';

/**
 * All valid card rarities in Clash Royale.
 */
export type Rarity = "Common" | "Rare" | "Epic" | "Legendary" | "Champion";

/**
 * Internal interface for King XP table entries.
 */
export interface KingXpRow {
  readonly level: number;
  readonly cumulative: XP;
}

/**
 * Atomic data bundle for a specific card upgrade.
 */
export interface UpgradeData {
  readonly cardsRequired: number;
  readonly goldCost: Gold;
  readonly xpGain: XP;
}
