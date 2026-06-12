// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * LABORATORY - Simulation Engine (Layer 3)
 * ----------------------------------------------------------------------------
 * Rationale: Implements the core greedy optimization logic for Clash Royale
 * player progression. This is a pure functional engine that operates on
 * immutable SimulationState objects.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * Architectural Context:
 * - Layer: Layer 3 (@features)
 * - Import Boundaries: Restricted to Layer 1 (@core) and internal Feature types.
 *   Satisfies ADR Section III: Validation Boundaries by operating on hydrated
 *   and validated domain objects.
 *
 * [DECISION LOG] GREEDY OPTIMIZATION:
 * The engine employs a greedy heuristic via a Priority Queue. While not
 * guaranteed to find the absolute global optimum for every edge case of
 * resource depletion, it provides an $O(N \log N)$ approximation that aligns
 * with realistic player upgrade behavior (prioritizing high ROI).
 */

import type { 
  SimulationState, 
  OptimizationSettings, 
  UpgradeCandidate,
  UpgradeAction,
  Card,
  Rarity,
  PlayerProfile,
  OptimizationResult
} from './Types';
import { 
  GOLD_COST_TABLE, 
  CARD_XP_TABLE, 
  MATERIAL_REQUIREMENTS,
  KING_XP_TABLE,
  CARD_LEVEL_CAP,
  calculateKingLevel as registryCalculateKingLevel,
  calculateGemCostForCards
} from '@core/utils/game';
import { PriorityQueue } from '@core/utils/PriorityQueue';
import type { ScoringStrategy } from './ScoringStrategy';
import { ProjectionStrategy, InventoryStrategy } from './ScoringStrategy';
import {
  asGold,
  asGems,
  addGold,
  addXP,
  addGems,
  subGold,
  canAffordGems,
  calculateGemCostForGold,
  type Gold,
  type XP,
  type Gems
} from '@core/utils/economy';

/** Internal candidate with resolved upgrade type. */
type ResolvedCandidate = UpgradeCandidate & { upgradeType: UpgradeAction['upgradeType'] };

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
const getUpgradeCandidate = (
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
  const goldCost = GOLD_COST_TABLE[card.rarity]?.[nextLevel];
  const cardsRequired = MATERIAL_REQUIREMENTS[card.rarity]?.[nextLevel];
  const xpGained = CARD_XP_TABLE[nextLevel];

  if (goldCost === undefined || cardsRequired === undefined || xpGained === undefined) return null;

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
const applyUpgrade = (state: SimulationState, candidate: ResolvedCandidate): SimulationState => {
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

/**
 * Orchestrates the iterative progression simulation.
 *
 * @remarks
 * CORE ENGINE: Generator that yields intermediate simulation states.
 * This allows the UI to show progress and remain responsive without
 * blocking the main thread.
 *
 * Satisfies ADR Section I: Foundations of "Clinical" Logic (Adaptive Pipeline
 * Design) and Section III: Validation Boundaries.
 *
 * [DECISION LOG] GENERATOR ORCHESTRATION:
 * By yielding every state change, we allow the consumer (useLaboratorySimulation)
 * to implement batching and requestIdleCallback integration, preventing
 * "Application Not Responding" (ANR) states during deep simulations.
 *
 * @param initialState - The starting point of the simulation.
 * @param settings - User configuration (targets, resource limits).
 * @param strategy - Optional scoring strategy (defaults to strategy from settings).
 * @returns A generator yielding intermediate SimulationStates.
 */
export function* calculateProgressionPath(
  initialState: SimulationState, 
  settings: OptimizationSettings,
  strategy?: ScoringStrategy
): Generator<SimulationState, SimulationState, void> {
  let currentState = initialState;
  let iterations = 0;
  const MAX_ITERATIONS = 5000; // Safety break

  // Resolve the strategy: explicit injection wins, then settings-based default.
  const scoringStrategy: ScoringStrategy = strategy ?? (
    settings.strategy === 'Resource Efficiency'
      ? new InventoryStrategy()
      : new ProjectionStrategy()
  );

  const targetLevel = settings.targetLevel || 90;
  const targetXpRow = KING_XP_TABLE.find(r => r.level === targetLevel) ?? KING_XP_TABLE[KING_XP_TABLE.length - 1];
  const targetXp = Number(targetXpRow.cumulative);

  // Initialize Priority Queue with a strategy-based comparator.
  const queue = new PriorityQueue<ResolvedCandidate>((a, b) =>
    scoringStrategy.calculateScore(a, settings) - scoringStrategy.calculateScore(b, settings)
  );

  // Initial population of the queue.
  currentState.roster.forEach((card, index) => {
    const candidate = getUpgradeCandidate(card, index, currentState, settings);
    if (candidate) queue.push(candidate);
  });

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    // 1. Termination Check - return (not yield) so done=true on this call.
    const currentKingLevel = registryCalculateKingLevel(Number(currentState.totalXp));
    if (currentKingLevel >= targetLevel || Number(currentState.totalXp) >= targetXp) {
      return currentState;
    }

    // 2. Extract best candidate from queue
    let bestChoice: ResolvedCandidate | undefined;

    while (queue.size() > 0) {
      const candidate = queue.pop()!;

      // LAZY RE-VALIDATION
      // Since inventory changed, we must re-calculate to ensure costs/gems are still accurate.
      // [THREAT:] Stale costs in the Priority Queue could lead to resource over-drafting.
      // [DECISION LOG] LAZY EVALUATION:
      // Instead of re-sorting the entire queue on every inventory change (O(N log N)),
      // we only re-validate the top candidate (O(log N)). If its viability or
      // score has changed, it is either discarded or re-pushed to its correct position.
      const freshCandidate = getUpgradeCandidate(
        currentState.roster[candidate.index],
        candidate.index,
        currentState,
        settings
      );

      if (!freshCandidate) continue; // No longer affordable or valid.

      // If the candidate's score is still the best (or if it's the only one left), we take it.
      // Otherwise, we re-push it to its new position and continue.
      const currentTop = queue.peek();
      if (!currentTop ||
          scoringStrategy.calculateScore(freshCandidate, settings) <= scoringStrategy.calculateScore(currentTop, settings)) {
        bestChoice = freshCandidate;
        break;
      } else {
        queue.push(freshCandidate);
      }
    }

    // 3. Termination: no viable upgrades
    if (!bestChoice) {
      return currentState;
    }

    // 4. Evolve State
    currentState = applyUpgrade(currentState, bestChoice);

    // 5. Re-queue the card that was just upgraded (for its NEXT level)
    const nextStep = getUpgradeCandidate(
      currentState.roster[bestChoice.index],
      bestChoice.index,
      currentState,
      settings
    );
    if (nextStep) queue.push(nextStep);

    // 6. Throttled Yield (every upgrade so tests always get fresh state)
    //    the UI consumer can batch if needed).
    yield currentState;
  }

  // Safety: MAX_ITERATIONS exceeded.
  return currentState;
}

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
