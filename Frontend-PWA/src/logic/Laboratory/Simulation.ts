import type { 
  Card, 
  Inventory, 
  OptimizationSettings, 
  SimulationState, 
  UpgradeAction, 
  UpgradeCandidate,
  Rarity
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
} from './Economy';
import { 
  CARD_LEVEL_CAP, 
  GOLD_COST_TABLE, 
  CARD_XP_TABLE, 
  MATERIAL_REQUIREMENTS, 
  GEM_CONVERSION_RATES, 
  EFFICIENCY_OVERRIDES, 
  KING_XP_TABLE 
} from './Registry';
import { PriorityQueue } from './PriorityQueue';
import { ScoringStrategy, FormulaicStrategy } from './ScoringStrategy';

const EPSILON = 1e-9;

/**
 * Pure function to calculate a candidate for a single card upgrade.
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
  const goldCost = GOLD_COST_TABLE[nextLevel];
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
    efficiencyRatio: 0 // Placeholder, strategy will populate
  };
}

/**
 * Pure function to apply an upgrade and return the NOVO state.
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
    efficiencyRatio: candidate.efficiencyRatio,
    priorityScore: candidate.efficiencyRatio,
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
 * Uses a Priority Queue for O(log N) selection and Strategy Injection for scoring.
 */
export function* calculateProgressionPath(
  initialState: SimulationState,
  settings: OptimizationSettings,
  strategy: ScoringStrategy = new FormulaicStrategy()
): Generator<SimulationState, SimulationState, void> {
  let currentState = initialState;
  
  // Initialize Priority Queue
  const pq = new PriorityQueue<UpgradeCandidate>((a, b) => a.efficiencyRatio - b.efficiencyRatio);

  // Initial population of the queue
  for (let i = 0; i < currentState.roster.length; i++) {
    const candidate = buildCandidate(currentState.roster[i], i, currentState.inventory, settings);
    if (candidate) {
      candidate.efficiencyRatio = calculateAdvancedScore(candidate, currentState, settings, strategy);
      pq.push(candidate);
    }
  }

  while (pq.size() > 0) {
    const bestCandidate = pq.pop()!;

    // Check target level for Projection strategy
    if (settings.strategy === "Level Projection" && settings.targetLevel) {
      const kingLevel = calculateKingLevel(currentState.totalXp);
      if (kingLevel >= settings.targetLevel) break;
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
      nextCandidate.efficiencyRatio = calculateAdvancedScore(nextCandidate, currentState, settings, strategy);
      pq.push(nextCandidate);
    }

    // Since inventory changed, other candidates might now be invalid (affordability)
    // In a high-performance engine, we'd prune the PQ lazily during pop.
    // For now, let's peek and prune invalid if they are at the top.
    while (pq.size() > 0) {
      const top = pq.peek()!;
      // Simple validation: can we still afford the gold/gems?
      // Note: buildCandidate already checks this. We re-verify here.
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
 * Calculates score with Multi-Step Lookahead.
 * Score = CurrentStepScore + (NextStepScore * 0.4)
 */
function calculateAdvancedScore(
  candidate: UpgradeCandidate, 
  state: SimulationState, 
  settings: OptimizationSettings,
  strategy: ScoringStrategy
): number {
  const currentScore = strategy.calculateScore(candidate, settings);
  
  // Multi-Step Lookahead Logic
  // We simulate what happens if we upgrade this specific card to its NEXT level.
  const virtualCard = { ...candidate.card, level: candidate.toLevel };
  const virtualInventory = { ...state.inventory }; // Simple shadow inventory
  virtualInventory.gold = subGold(virtualInventory.gold, candidate.goldCost);
  virtualInventory.gems = subGems(virtualInventory.gems, candidate.gemsUsed);

  const nextPotential = buildCandidate(virtualCard, candidate.index, virtualInventory, settings);
  if (nextPotential) {
    const nextScore = strategy.calculateScore(nextPotential, settings);
    // Weighted lookahead avoids greedy traps (e.g. taking a cheap level now that prevents a massive value level later)
    return currentScore + (nextScore * 0.4);
  }

  return currentScore;
}

function calculateKingLevel(totalXp: number): number {
  let level = 1;
  for (const row of KING_XP_TABLE) {
    if (totalXp >= Number(row.cumulative)) {
      level = row.level;
    } else {
      break;
    }
  }
  return level;
}
