// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * LABORATORY - Progression Simulation Engine (Layer 3)
 * ----------------------------------------------------------------------------
 * Rationale: High-performance optimization engine for card progression.
 * Features: Priority Queue selection, Recursive Chain Lookahead, Strategy Injection.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * This module implements the core logic for the progression simulator. It
 * operates as a pure logic layer within the Laboratory feature.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 3 (@features)
 * - **Import Boundaries:** May import from Layer 1 (@core) and Layer 2 (@shared).
 *   Imports from other Features or Layer 4 (@app) are strictly forbidden.
 */

import type { 
  Card, 
  Inventory, 
  OptimizationSettings, 
  SimulationState, 
  UpgradeAction, 
  UpgradeCandidate,
  Rarity,
  PlayerProfile,
  OptimizationResult
} from './Types';
import { 
  subGold, 
  subGems, 
  asGold, 
  asGems, 
  asXP, 
  addXP,
  addGold,
  addGems,
  GEM_TO_GOLD_FACTOR
} from '@core/utils/economy';
import { 
  CARD_LEVEL_CAP, 
  GOLD_COST_TABLE, 
  CARD_XP_TABLE, 
  MATERIAL_REQUIREMENTS, 
  GEM_CONVERSION_RATES, 
  EFFICIENCY_OVERRIDES, 
  KING_XP_TABLE,
  LOOKAHEAD_WEIGHT,
  LOOKAHEAD_PRECISION,
  IMPORTANT_KING_LEVELS,
  calculateKingLevel,
  calculateDefaultTarget
} from './Registry';
import { PriorityQueue } from '@core/utils/PriorityQueue';
import type { 
  ScoringStrategy 
} from './ScoringStrategy';
import { 
  ProjectionStrategy, 
  InventoryStrategy 
} from './ScoringStrategy';

const EPSILON = 1e-9;

/**
 * Pure function to calculate a candidate for a single card upgrade.
 *
 * @param card - The current state of the card to be evaluated.
 * @param index - The index of the card within the roster.
 * @param inventory - Current resource state (Gold, Gems, Wild Cards).
 * @param settings - Optimization constraints and modes.
 * @returns An UpgradeCandidate if the upgrade is possible, otherwise null.
 */
function buildCandidate(
  card: Card,
  index: number,
  inventory: Inventory,
  settings: OptimizationSettings
): UpgradeCandidate | null {
  const nextLevel = card.level + 1;
  if (nextLevel > CARD_LEVEL_CAP) return null;

  const cardsRequired = MATERIAL_REQUIREMENTS[card.rarity][nextLevel];
  const goldCost = GOLD_COST_TABLE[card.rarity]?.[nextLevel];
  const xpGain = CARD_XP_TABLE[nextLevel];

  if (cardsRequired === undefined || goldCost === undefined) return null;

  const cardsUsed = Math.min(card.count, cardsRequired);
  let remainingNeeded = cardsRequired - cardsUsed;

  const wildAvailable = card.isTowerTroop ? 0 : (inventory.wildCards[card.rarity] || 0);
  let gemsUsed = asGems(0);
  let finalWildUsed = 0;

  if (settings.infiniteResources) {
    // In infinite mode, we conceptually use what we need.
    finalWildUsed = remainingNeeded;
    
    // Theoretical Gem calculation for material deficit
    const deficit = Math.max(0, remainingNeeded - wildAvailable);
    if (deficit > 0 && settings.allowGemSpending) {
      const rate = GEM_CONVERSION_RATES[card.rarity] || 1;
      gemsUsed = addGems(gemsUsed, asGems(Math.ceil(deficit * rate)));
    }

    // Theoretical Gem calculation for gold deficit
    if (goldCost > inventory.gold && settings.allowGemSpending) {
      const goldDeficit = subGold(goldCost, inventory.gold);
      const gemsForGold = asGems(Math.ceil(Number(goldDeficit) / 20)); // GEM_TO_GOLD_FACTOR = 20
      gemsUsed = addGems(gemsUsed, gemsForGold);
    }
  } else {
    // 2. Real resources mode
    const wildToUse = Math.min(remainingNeeded, Math.max(0, wildAvailable));
    finalWildUsed = wildToUse;
    remainingNeeded -= wildToUse;

    if (remainingNeeded > 0) {
      if (settings.allowGemSpending) {
        const rate = GEM_CONVERSION_RATES[card.rarity] || 1;
        gemsUsed = addGems(gemsUsed, asGems(Math.ceil(remainingNeeded * rate)));
      } else {
        return null;
      }
    }

    // Gold Deficit Gems (Real mode)
    if (goldCost > inventory.gold) {
      if (settings.allowGemSpending) {
        const goldDeficit = subGold(goldCost, inventory.gold);
        const gemsForGold = asGems(Math.ceil(Number(goldDeficit) / GEM_TO_GOLD_FACTOR)); // GEM_TO_GOLD_FACTOR = 20
        gemsUsed = addGems(gemsUsed, gemsForGold);
      } else {
        return null;
      }
    }

    // Check final budget
    if (Number(gemsUsed) > Number(inventory.gems)) return null;
  }

  // No default efficiency calculation here - delegated to Strategy
  return {
    index,
    card: { ...card },
    fromLevel: card.level,
    toLevel: nextLevel,
    goldCost,
    cardsRequired,
    cardsUsed,
    wildCardsUsed: finalWildUsed,
    gemsUsed,
    xpGained: xpGain,
    efficiencyIndex: 0 // Placeholder, strategy will populate
  };
}

/**
 * Pure function to apply an upgrade and return the new state.
 *
 * @param state - The current simulation state.
 * @param candidate - The upgrade candidate to apply.
 * @returns A new SimulationState reflecting the applied upgrade.
 */
function applyUpgrade(state: SimulationState, candidate: UpgradeCandidate): SimulationState {
  const newRoster = [...state.roster];
  const targetCard = { ...newRoster[candidate.index] };
  
  targetCard.level = candidate.toLevel;
  targetCard.count -= candidate.cardsUsed;
  newRoster[candidate.index] = targetCard;

  const newWildCards = { ...state.inventory.wildCards };
  newWildCards[targetCard.rarity] -= candidate.wildCardsUsed;

  const newInventory: Inventory = {
    gold: subGold(state.inventory.gold, candidate.goldCost),
    gems: subGems(state.inventory.gems, candidate.gemsUsed),
    wildCards: newWildCards
  };

  const action: UpgradeAction = {
    cardName: targetCard.name,
    rarity: targetCard.rarity,
    currentLevel: candidate.fromLevel,
    targetLevel: candidate.toLevel,
    goldCost: candidate.goldCost,
    cardCost: candidate.cardsUsed,
    wildCardsUsed: candidate.wildCardsUsed,
    gemsUsed: candidate.gemsUsed,
    xpGained: candidate.xpGained,
    efficiencyIndex: candidate.efficiencyIndex,
    upgradeType: candidate.gemsUsed > 0 ? "Gem" : (candidate.wildCardsUsed > 0 ? "Wild" : "Direct"),
    isTowerTroop: targetCard.isTowerTroop
  };

  const newTotalWildCardsUsed = { ...state.totalWildCardsUsed };
  newTotalWildCardsUsed[targetCard.rarity] += candidate.wildCardsUsed;

  return {
    roster: newRoster,
    inventory: newInventory,
    totalXp: addXP(state.totalXp, candidate.xpGained),
    totalGoldSpent: addGold(state.totalGoldSpent, candidate.goldCost),
    totalGemsSpent: addGems(state.totalGemsSpent, candidate.gemsUsed),
    totalWildCardsUsed: newTotalWildCardsUsed,
    history: [...state.history, action]
  };
}

/**
 * Non-blocking Generator Engine for Progression Simulation.
 *
 * @remarks
 * This engine uses a Priority Queue (O(log N) selection) to iteratively pick the
 * most efficient upgrade. It supports non-blocking execution via the Generator
 * pattern, allowing the UI to remain responsive during long simulations.
 *
 * Algorithmic Complexity:
 * - Initialization: O(N log N) where N is the number of cards.
 * - Selection/Update: O(log N) per upgrade step.
 *
 * @param initialState - The starting state of the simulation.
 * @param settings - User-defined optimization settings.
 * @param providedStrategy - Optional custom scoring strategy.
 * @yields The next state after each upgrade step.
 * @returns The final simulation state.
 */
export function* calculateProgressionPath(
  initialState: SimulationState,
  settings: OptimizationSettings,
  providedStrategy?: ScoringStrategy
): Generator<SimulationState, SimulationState, void> {
  let currentState = initialState;
  
  // Strategy Selection: Fallback to Projection if not provided
  const strategy = providedStrategy || (
    settings.strategy === "Level Projection" 
      ? new ProjectionStrategy() 
      : new InventoryStrategy()
  );
  
  // Initialize Priority Queue
  const pq = new PriorityQueue<UpgradeCandidate>((a, b) => a.efficiencyIndex - b.efficiencyIndex);

  // Pre-calculate target XP for Level Projection
  let targetXp = -1;
  if (settings.strategy === "Level Projection" && settings.targetLevel) {
    const targetLevelNum = Number(settings.targetLevel);
    const targetRow = KING_XP_TABLE.find(row => row.level === targetLevelNum);
    if (targetRow) {
      targetXp = Number(targetRow.cumulative);
    }
  }

  // Initial population of the queue
  for (let i = 0; i < currentState.roster.length; i++) {
    const candidate = buildCandidate(currentState.roster[i], i, currentState.inventory, settings);
    if (candidate) {
      candidate.efficiencyIndex = calculateAdvancedScore(candidate, currentState, settings, strategy);
      pq.push(candidate);
    }
  }

  while (pq.size() > 0) {
    const bestCandidate = pq.pop()!;

    // Check target level for Projection strategy
    if (targetXp !== -1 && Number(currentState.totalXp) >= targetXp) {
      break;
    }

    // Apply the upgrade
    const nextState = applyUpgrade(currentState, bestCandidate);
    currentState = nextState;

    // Yield the new state
    yield currentState;

    // Refresh ONLY the candidate that was upgraded
    const nextCandidate = buildCandidate(
      currentState.roster[bestCandidate.index], 
      bestCandidate.index, 
      currentState.inventory, 
      settings
    );

    if (nextCandidate) {
      nextCandidate.efficiencyIndex = calculateAdvancedScore(nextCandidate, currentState, settings, strategy);
      pq.push(nextCandidate);
    }

    // Since inventory changed, other candidates might now be invalid (affordability)
    // Rationale: We prune invalid candidates lazily or explicitly when resource constraints shift.
    while (pq.size() > 0) {
      const top = pq.peek()!;
      // Simple validation: can we still afford the gold/gems?
      const stillValid = buildCandidate(currentState.roster[top.index], top.index, currentState.inventory, settings);
      if (!stillValid) {
        pq.pop();
      } else {
        break;
      }
    }
  }

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
  const kingLevel = calculateKingLevel(state.totalXp);
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

