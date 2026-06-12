// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import type {
  SimulationState,
  UpgradeAction,
  Rarity,
  PlayerProfile,
  OptimizationResult
} from './Types';
import {
  KING_XP_TABLE,
  calculateKingLevel as registryCalculateKingLevel
} from '@core/utils/game';

/**
 * Transforms simulation internal state into a UI-compatible result object.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries (DTO Mapping) by
 * mapping Persistence-Ignorant domain objects to formatted output.
 *
 * @param state - The current state of the simulation.
 * @param originalProfile - The original player profile before simulation.
 * @param initialXp - The initial XP of the player.
 * @returns A formatted result compatible with existing UI components.
 */
export function mapStateToResult(
  state: SimulationState,
  originalProfile: PlayerProfile,
  initialXp: number
): OptimizationResult {
  const kingLevel = registryCalculateKingLevel(Number(state.totalXp));
  let xpIntoLevel = 0;

  for (const row of KING_XP_TABLE) {
    if (row.level === kingLevel) {
      xpIntoLevel = Number(state.totalXp) - Number(row.cumulative);
      break;
    }
  }

  return {
    actions: state.history as UpgradeAction[],
    totalXpGained: Number(state.totalXp) - initialXp,
    projectedKingLevel: kingLevel,
    finalProfile: {
      ...originalProfile,
      kingLevel,
      xpIntoLevel
    },
    finalGold: Number(state.inventory.gold),
    finalGems: Number(state.inventory.gems),
    totalGoldSpent: Number(state.totalGoldSpent),
    totalGemsSpent: Number(state.totalGemsSpent),
    totalWildCardsUsed: state.totalWildCardsUsed as Record<Rarity, number>
  };
}
