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
  calculateKingLevel as registryCalculateKingLevel,
  calculateXpIntoLevel
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
  const xpIntoLevel = calculateXpIntoLevel(Number(state.totalXp));

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
