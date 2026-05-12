// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * LABORATORY - Simulation Engine (Layer 3)
 * ----------------------------------------------------------------------------
 * Rationale: Implements the core greedy optimization logic for Clash Royale
 * player progression. This is a pure functional engine that operates on
 * immutable SimulationState objects.
 * ----------------------------------------------------------------------------
 */

import type { 
  SimulationState, 
  OptimizationSettings, 
  UpgradeCandidate,
  UpgradeAction,
  Card,
  Rarity
} from './Types';
import { 
  GOLD_COST_TABLE, 
  CARD_XP_TABLE, 
  MATERIAL_REQUIREMENTS,
  KING_XP_TABLE,
  LOOKAHEAD_WEIGHT,
  LOOKAHEAD_PRECISION,
  IMPORTANT_KING_LEVELS,
  calculateKingLevel as registryCalculateKingLevel
} from './Registry';
import { asGold, asXP, addGold, addXP, type Gold, type XP } from '@core/utils/economy';

/**
 * Calculates the current King Level based on cumulative XP.
 */
export const calculateKingLevel = (totalXp: XP): number => {
  const xpValue = Number(totalXp);
  // Find the highest level where cumulative XP is less than or equal to current XP
  for (let i = KING_XP_TABLE.length - 1; i >= 0; i--) {
    if (xpValue >= Number(KING_XP_TABLE[i].cumulative)) {
      return KING_XP_TABLE[i].level;
    }
  }
  return 1;
};

/**
 * Determines if a card can be upgraded given the current state and settings.
 */
const getUpgradeCandidate = (
  card: Card, 
  index: number, 
  state: SimulationState, 
  settings: OptimizationSettings
): UpgradeCandidate | null => {
  const nextLevel = card.level + 1;
  
  // 1. Check Level Cap
  if (nextLevel > 16) return null;

  // 2. Resource Requirements
  const goldCost = GOLD_COST_TABLE[nextLevel];
  const cardsRequired = MATERIAL_REQUIREMENTS[card.rarity][nextLevel];
  const xpGained = CARD_XP_TABLE[nextLevel];

  // 3. Inventory Checks
  const hasGold = settings.infiniteResources || Number(state.inventory.gold) >= Number(goldCost);
  
  // Cards check includes Wild Cards if strategy permits (Simplified for now)
  const availableCards = card.count;
  const cardsNeededFromWilds = Math.max(0, cardsRequired - availableCards);
  
  // For this engine version, we only allow upgrades if the user has enough actual cards
  // or if infiniteResources is enabled.
  const hasCards = settings.infiniteResources || availableCards >= cardsRequired;

  if (!hasGold || !hasCards) return null;

  // 4. Efficiency Calculation (Greedy)
  // Base efficiency = XP gained per Gold spent
  const efficiencyIndex = Number(xpGained) / (Number(goldCost) || 1);

  return {
    index,
    card,
    fromLevel: card.level,
    toLevel: nextLevel,
    goldCost,
    cardsRequired,
    cardsUsed: cardsRequired,
    wildCardsUsed: 0,
    gemsUsed: 0 as any,
    xpGained,
    efficiencyIndex
  };
};

/**
 * Applies an upgrade action to a state, returning a new immutable state.
 */
const applyUpgrade = (state: SimulationState, candidate: UpgradeCandidate): SimulationState => {
  const newRoster = [...state.roster];
  const upgradedCard = { 
    ...candidate.card, 
    level: candidate.toLevel,
    count: candidate.card.count - candidate.cardsUsed
  };
  newRoster[candidate.index] = upgradedCard;

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
    upgradeType: "Direct",
    isTowerTroop: candidate.card.isTowerTroop
  };

  return {
    roster: newRoster,
    inventory: {
      ...state.inventory,
      gold: asGold(Math.max(0, Number(state.inventory.gold) - Number(candidate.goldCost)))
    },
    totalXp: addXP(state.totalXp, candidate.xpGained),
    totalGoldSpent: addGold(state.totalGoldSpent, candidate.goldCost),
    totalGemsSpent: state.totalGemsSpent,
    totalWildCardsUsed: state.totalWildCardsUsed, // Simplified
    history: [...state.history, action]
  };
};

/**
 * CORE ENGINE: Generator that yields intermediate simulation states.
 * This allows the UI to show progress and remain responsive.
 *
 * @param initialState - The starting point of the simulation.
 * @param settings - User configuration (targets, resource limits).
 */
export function* calculateProgressionPath(
  initialState: SimulationState, 
  settings: OptimizationSettings
): Generator<SimulationState, SimulationState, void> {
  let currentState = initialState;
  let iterations = 0;
  const MAX_ITERATIONS = 5000; // Safety break

  const targetLevel = settings.targetLevel || 90;
  const targetXpRow = KING_XP_TABLE.find(r => r.level === targetLevel) || KING_XP_TABLE[KING_XP_TABLE.length - 1];
  const targetXp = Number(targetXpRow.cumulative);

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    // 1. Termination Check
    const currentKingLevel = calculateKingLevel(currentState.totalXp);
    if (currentKingLevel >= targetLevel || Number(currentState.totalXp) >= targetXp) {
        // yield the final state before returning to ensure the consumer sees the terminal result.
        yield currentState;
        return currentState;
    }

    // 2. Identify all possible upgrades
    const candidates: UpgradeCandidate[] = [];
    currentState.roster.forEach((card, index) => {
      const candidate = getUpgradeCandidate(card, index, currentState, settings);
      if (candidate) candidates.push(candidate);
    });

    // 3. Strategy-based Selection
    if (candidates.length === 0) {
      // yield the final state before returning to ensure the consumer sees the terminal result.
      yield currentState;
      return currentState;
    }

    // Default strategy: XP/Gold Efficiency
    candidates.sort((a, b) => b.efficiencyIndex - a.efficiencyIndex);
    const bestChoice = candidates[0];

    // 4. Evolve State
    currentState = applyUpgrade(currentState, bestChoice);

    // 5. Throttled Yield (Every 5 upgrades to reduce UI overhead)
    if (iterations % 5 === 0) {
      yield currentState;
    }
  }

  // yield the final state before returning to ensure the consumer sees the terminal result.
  yield currentState;
  return currentState;
}

/**
 * Calculates a multidimensional efficiency score using Recursive Chain Lookahead.
 *
 * @remarks
 * This function evaluates the "character arc" of a card by simulating future
 * upgrade steps. This prevents "greedy" local optima traps where a cheap but
 * low-value upgrade is picked over a more expensive but higher-impact chain.
 *
 * Formula: Score = Sum(StepScore[i] * 0.4^i)
 *
 * @param candidate - The immediate upgrade candidate being scored.
 * @param state - The current simulation state.
 * @param settings - Optimization settings.
 * @param strategy - The scoring strategy to use.
 * @param depth - Current recursion depth for lookahead.
 * @returns A weighted efficiency score.
 */
function calculateAdvancedScore(
  candidate: UpgradeCandidate, 
  state: SimulationState, 
  settings: OptimizationSettings,
  strategy: ScoringStrategy,
  depth: number = 0
): number {
  const currentScore = strategy.calculateScore(candidate, settings);
  
  // Principled Convergence: Stop if the future weight is statistically insignificant
  const currentWeightFactor = Math.pow(LOOKAHEAD_WEIGHT, depth);
  if (currentWeightFactor < LOOKAHEAD_PRECISION) {
    return currentScore;
  }

  // Domain Boundary: Stop if we've reached the theoretical game limit
  if (candidate.toLevel >= CARD_LEVEL_CAP) {
    return currentScore;
  }

  // We simulate what happens if we upgrade this specific card to its NEXT level.
  const virtualCard = { ...candidate.card, level: candidate.toLevel };
  const virtualInventory = { ...state.inventory };
  
  virtualInventory.gold = subGold(virtualInventory.gold, candidate.goldCost);
  virtualInventory.gems = subGems(virtualInventory.gems, candidate.gemsUsed);

  const nextPotential = buildCandidate(virtualCard, candidate.index, virtualInventory, settings);
  
  if (nextPotential) {
    const nextScore = calculateAdvancedScore(
      nextPotential, 
      state, 
      settings,
      strategy,
      depth + 1
    );
    // Weighted chain avoids local optima by incorporating downstream benefits.
    return currentScore + (nextScore * LOOKAHEAD_WEIGHT);
  }

  return currentScore;
}

/**
 * Maps the internal SimulationState to the legacy OptimizationResult for UI compatibility.
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
