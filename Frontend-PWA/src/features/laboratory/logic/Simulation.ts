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
} from './Registry';
import type { ScoringStrategy } from './ScoringStrategy';
import { ProjectionStrategy, InventoryStrategy } from './ScoringStrategy';
import { asGold, asGems, addGold, addXP, addGems, type Gold, type XP, type Gems } from '@core/utils/economy';

/** Internal candidate with resolved upgrade type. */
type ResolvedCandidate = UpgradeCandidate & { upgradeType: UpgradeAction['upgradeType'] };

/**
 * Determines if a card can be upgraded given the current state and settings,
 * resolving material deficits via Wild Cards or Gems if permitted.
 *
 * Fix: GOLD_COST_TABLE and MATERIAL_REQUIREMENTS are keyed by Rarity, not
 * flat by level. Previous code used GOLD_COST_TABLE[nextLevel] which always
 * returned undefined. Corrected to GOLD_COST_TABLE[card.rarity][nextLevel].
 *
 * Fix: Wild card and gem resolution paths were stubbed out. They are now
 * implemented so that tests exercising those code paths pass correctly.
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

  // 2. Resource Requirements — look up by rarity, not flat by level.
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
    const goldDeficit = Number(goldCost) - Number(state.inventory.gold);
    // 1 Gem converts to 20 Gold (standard shop rate).
    const gemsNeeded = Math.ceil(goldDeficit / 20);
    const totalGemsNeeded = Number(gemsUsedForCards) + gemsNeeded;
    if (totalGemsNeeded > Number(state.inventory.gems)) return null;
    gemsUsedForGold = asGems(gemsNeeded);
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
 * Applies an upgrade action to a state, returning a new immutable state.
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
 * CORE ENGINE: Generator that yields intermediate simulation states.
 * This allows the UI to show progress and remain responsive.
 *
 * Fix: The old termination logic did `yield currentState; return currentState`
 * inside the loop. This meant the terminal state was emitted with done=false,
 * and the subsequent .next() call returned {done: true, value: undefined}.
 * Tests that checked `result.done === true` on the first exhausted call failed.
 * Corrected: the generator now simply `return`s without yielding on termination,
 * which causes the generator protocol to set done=true on the return value.
 *
 * Fix: Accepts an optional ScoringStrategy. Previously the third parameter was
 * absent from the signature, so Divergence.spec.ts injected strategies that
 * were silently ignored. The injected strategy is now used for candidate ranking.
 *
 * @param initialState - The starting point of the simulation.
 * @param settings - User configuration (targets, resource limits).
 * @param strategy - Optional scoring strategy (defaults to strategy from settings).
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

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    // 1. Termination Check — return (not yield) so done=true on this call.
    const currentKingLevel = registryCalculateKingLevel(Number(currentState.totalXp));
    if (currentKingLevel >= targetLevel || Number(currentState.totalXp) >= targetXp) {
      return currentState;
    }

    // 2. Identify all possible upgrades
    const candidates: ResolvedCandidate[] = [];
    currentState.roster.forEach((card, index) => {
      const candidate = getUpgradeCandidate(card, index, currentState, settings);
      if (candidate) candidates.push(candidate);
    });

    // 3. Termination: no viable upgrades — return so done=true on this call.
    if (candidates.length === 0) {
      return currentState;
    }

    // 4. Strategy-based ranking (lower score = higher priority).
    candidates.sort((a, b) => scoringStrategy.calculateScore(a, settings) - scoringStrategy.calculateScore(b, settings));
    const bestChoice = candidates[0];

    // 5. Evolve State
    currentState = applyUpgrade(currentState, bestChoice);

    // 6. Throttled Yield (every upgrade so tests always get fresh state;
    //    the UI consumer can batch if needed).
    yield currentState;
  }

  // Safety: MAX_ITERATIONS exceeded.
  return currentState;
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
