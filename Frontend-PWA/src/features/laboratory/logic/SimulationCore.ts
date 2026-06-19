// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import type {
  SimulationState,
  OptimizationSettings,
  UpgradeCandidate,
  UpgradeAction,
  Card
} from './Types';
import {
  CARD_LEVEL_CAP,
  calculateGemCostForCards,
  getUpgradeData
} from '@core/utils/game';
import {
  asGold,
  asGems,
  addGold,
  addXP,
  addGems,
  subGold,
  canAffordGems,
  calculateGemCostForGold
} from '@core/utils/economy';

/** Internal candidate with resolved upgrade type. */
export type ResolvedCandidate = UpgradeCandidate & { upgradeType: UpgradeAction['upgradeType'] };

/**
 * Evaluates the viability of a card upgrade against current resource constraints.
 *
 * @remarks
 * This function handles the complex resolution logic for material deficits,
 * prioritizing Wild Cards before attempting Gem conversion if settings allow.
 * Satisfies ADR Section I: Foundations of "Clinical" Logic by deriving costs
 * and gains from centralized game tables (SSOT).
 *
 * @param card - The card to evaluate.
 * @param index - The roster index of the card.
 * @param state - Current simulation state containing inventory and total XP.
 * @param settings - User optimization constraints (Allow Gems, Infinite Mode).
 * @returns A ResolvedCandidate if the upgrade is possible, otherwise null.
 */
export const getUpgradeCandidate = (
  card: Card,
  index: number,
  state: SimulationState,
  settings: OptimizationSettings
): ResolvedCandidate | null => {
  const nextLevel = card.level + 1;

  // 1. Check Level Cap
  if (nextLevel > CARD_LEVEL_CAP) return null;

  // 2. Resource Requirements - look up by rarity, not flat by level.
  // [DECISION LOG] SSOT ALIGNMENT:
  // Rarity-based lookups ensure that specialized rarities (Champion, Legendary)
  // respect their unique cost curves defined in Layer 1 @core/utils/game.
  const upgradeData = getUpgradeData(card.rarity, nextLevel);
  if (!upgradeData) return null;

  const { goldCost, cardsRequired, xpGain: xpGained } = upgradeData;

  // 3. Gold check
  const hasGold = settings.infiniteResources || Number(state.inventory.gold) >= Number(goldCost);

  // 4. Cards / Wild Cards check
  const availableCards = card.count;
  const cardDeficit = Math.max(0, cardsRequired - availableCards);
  const availableWilds = state.inventory.wildCards[card.rarity] ?? 0;
  const wildDeficit = Math.max(0, cardDeficit - availableWilds);

  let wildCardsUsed = 0;
  let gemsUsedForCards = asGems(0);
  let upgradeType: UpgradeAction['upgradeType'] = 'Direct';

  if (settings.infiniteResources) {
    // Infinite mode: always possible, no real resource consumption.
    wildCardsUsed = 0;
  } else if (cardDeficit === 0) {
    // Sufficient real cards.
    wildCardsUsed = 0;
  } else if (cardDeficit <= availableWilds) {
    // Wild cards cover the deficit.
    wildCardsUsed = cardDeficit;
    upgradeType = 'Wild';
  } else if (wildDeficit > 0 && settings.allowGemSpending) {
    // Gems cover any remaining deficit after wilds are exhausted.
    // [THREAT:] Material shortage could stall the engine.
    // [DECISION LOG] GEM FALLBACK:
    // If 'allowGemSpending' is enabled, the engine calculates the market
    // gem-equivalent for the missing cards, treating Gems as a universal material.
    wildCardsUsed = availableWilds;
    gemsUsedForCards = calculateGemCostForCards(card.rarity, wildDeficit);
    upgradeType = 'Gem';
    const hasGems = Number(state.inventory.gems) >= Number(gemsUsedForCards);
    if (!hasGems) return null;
  } else {
    // No sufficient materials and no fallback available.
    return null;
  }

  // 5. Gold-via-Gems fallback
  let gemsUsedForGold = asGems(0);
  if (!hasGold && settings.allowGemSpending) {
    const goldDeficit = subGold(goldCost, state.inventory.gold);
    const gemsNeeded = calculateGemCostForGold(goldDeficit);
    const totalGemsNeeded = addGems(gemsUsedForCards, gemsNeeded);

    if (!canAffordGems(state.inventory.gems, totalGemsNeeded)) return null;

    gemsUsedForGold = gemsNeeded;
    upgradeType = 'Gem';
  } else if (!hasGold) {
    return null;
  }

  const totalGemsUsed = asGems(Number(gemsUsedForCards) + Number(gemsUsedForGold));

  // 6. Efficiency Calculation
  const efficiencyIndex = Number(xpGained) / (Number(goldCost) || 1);

  return {
    index,
    card,
    fromLevel: card.level,
    toLevel: nextLevel,
    goldCost,
    cardsRequired,
    cardsUsed: Math.min(availableCards, cardsRequired),
    wildCardsUsed,
    gemsUsed: totalGemsUsed,
    xpGained,
    efficiencyIndex,
    upgradeType
  };
};

/**
 * Executes a state transition by applying a chosen upgrade.
 *
 * @remarks
 * This function maintains the immutability of the simulation state,
 * returning a new state object with updated roster, inventory, and history.
 *
 * Satisfies ADR Section III: Data Flow & Transactional Integrity by ensuring
 * that simulation snapshots are never mutated in-place.
 *
 * @param state - The previous simulation state.
 * @param candidate - The upgrade candidate to apply.
 * @returns A new immutable SimulationState.
 */
export const applyUpgrade = (state: SimulationState, candidate: ResolvedCandidate): SimulationState => {
  const newRoster = [...state.roster];
  const upgradedCard = {
    ...candidate.card,
    level: candidate.toLevel,
    count: Math.max(0, candidate.card.count - candidate.cardsUsed)
  };
  newRoster[candidate.index] = upgradedCard;

  const newWilds = { ...state.inventory.wildCards };
  if (candidate.wildCardsUsed > 0) {
    newWilds[candidate.card.rarity] = Math.max(0, (newWilds[candidate.card.rarity] ?? 0) - candidate.wildCardsUsed);
  }

  const action: UpgradeAction = {
    cardName: candidate.card.name,
    rarity: candidate.card.rarity,
    currentLevel: candidate.fromLevel,
    targetLevel: candidate.toLevel,
    goldCost: candidate.goldCost,
    cardCost: candidate.cardsUsed,
    wildCardsUsed: candidate.wildCardsUsed,
    gemsUsed: candidate.gemsUsed,
    xpGained: candidate.xpGained,
    efficiencyIndex: candidate.efficiencyIndex,
    upgradeType: candidate.upgradeType,
    isTowerTroop: candidate.card.isTowerTroop
  };

  const goldSpent = Number(state.inventory.gold) > 0
    ? Math.min(Number(state.inventory.gold), Number(candidate.goldCost))
    : 0;

  return {
    roster: newRoster,
    inventory: {
      gold: asGold(Math.max(0, Number(state.inventory.gold) - goldSpent)),
      gems: asGems(Math.max(0, Number(state.inventory.gems) - Number(candidate.gemsUsed))),
      wildCards: newWilds
    },
    totalXp: addXP(state.totalXp, candidate.xpGained),
    totalGoldSpent: addGold(state.totalGoldSpent, candidate.goldCost),
    totalGemsSpent: addGems(state.totalGemsSpent, candidate.gemsUsed),
    totalWildCardsUsed: {
      ...state.totalWildCardsUsed,
      [candidate.card.rarity]: (state.totalWildCardsUsed[candidate.card.rarity] ?? 0) + candidate.wildCardsUsed
    },
    history: [...state.history, action]
  };
};
