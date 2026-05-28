// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * LABORATORY - Feature Calibration (Layer 3)
 * ----------------------------------------------------------------------------
 * Rationale: Feature-specific calibration for the Laboratory simulation engine.
 * Generic game constants are sourced from the core substrate.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * Architectural Context:
 * - Layer: Layer 3 (@features)
 * - Import Boundaries: Restricted to Layer 1 (@core) and Layer 2 (@shared).
 */

import {
  type Rarity,
  type Gold,
  type XP,
  GOLD_COST_TABLE,
  MATERIAL_REQUIREMENTS,
  CARD_XP_TABLE
} from '@core/utils/game';

// --- Logic Calibration (Engine 2.3) ---

/**
 * Specific efficiency overrides for individual cards.
 * Rationale: Allows manual calibration for cards that provide abnormal value
 * relative to their level (e.g., Champions or recently buffed cards).
 */
const EFFICIENCY_OVERRIDES: Readonly<Record<string, number>> = {
  // Add specific card overrides here if necessary
};

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
  const goldCost = GOLD_COST_TABLE[rarity][targetLevel];
  const xpGain = CARD_XP_TABLE[targetLevel];

  if (cardsRequired === undefined || goldCost === undefined || xpGain === undefined) {
    return null;
  }

  return { cardsRequired, goldCost, xpGain };
}
