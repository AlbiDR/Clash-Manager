
/**
 * ============================================================================
 * ⚡ MODULE: QUARTERMASTER KERNEL
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Pure logic engine for determining the optimal upgrade path.
 *    Replicates `Level16Optimizer.generate_plan` using a greedy algorithm.
 *    Optimized with active-list pruning and binary search solvers.
 * ============================================================================
 */

import {
  CARD_XP_TABLE,
  GOLD_COST_TABLE,
  MATERIAL_REQUIREMENTS,
  GEM_CONVERSION_RATES,
  EFFICIENCY_OVERRIDES,
  KING_XP_TABLE,
  CARD_LEVEL_CAP,
  GEM_VALUE_IN_GOLD
} from './Quartermaster_Tables';

import type {
  Card,
  Inventory,
  PlayerData,
  OptimizationSettings,
  OptimizationResult,
  UpgradeCandidate,
  UpgradeAction,
  PlayerProfile,
  Rarity,
  Mutable
} from './Quartermaster_Types';

/**
 * Calculates a single specific upgrade possibility for a given card.
 */
function buildCandidate(
  card: Card,
  index: number,
  inventory: Inventory,
  settings: OptimizationSettings
): UpgradeCandidate | null {
  
  const nextLevel = card.level + 1;
  if (nextLevel > CARD_LEVEL_CAP) return null;

  const cardsRequired = MATERIAL_REQUIREMENTS[card.rarity]?.[nextLevel];
  const goldCost = GOLD_COST_TABLE[nextLevel];
  const xpGain = CARD_XP_TABLE[nextLevel];

  if (cardsRequired === undefined || goldCost === undefined || xpGain === undefined) {
    return null;
  }

  const cardsUsed = Math.min(card.count, cardsRequired);
  let remainingNeeded = cardsRequired - cardsUsed;

  const wildAvailable = inventory.wildCards[card.rarity] || 0;
  const wildUsed = Math.min(remainingNeeded, Math.max(0, wildAvailable));
  remainingNeeded -= wildUsed;

  let gemsUsed = 0;
  if (remainingNeeded > 0) {
    if (settings.strategy !== "Gems") return null;
    const gemRate = GEM_CONVERSION_RATES[card.rarity];
    gemsUsed = Math.ceil(remainingNeeded * gemRate);
    remainingNeeded = 0;
  }

  if (remainingNeeded > 0) return null;

  if (!settings.infiniteGold && goldCost > inventory.gold) return null;
  if (gemsUsed > inventory.gems) return null;

  const effectiveCost = goldCost + (gemsUsed * GEM_VALUE_IN_GOLD);

  const override = EFFICIENCY_OVERRIDES[nextLevel];
  const efficiencyRatio = override !== undefined 
    ? override 
    : effectiveCost / xpGain;

  const materialEfficiency = cardsRequired > 0 ? xpGain / cardsRequired : 0;

  return {
    index,
    card: { ...card },
    fromLevel: card.level,
    toLevel: nextLevel,
    goldCost,
    cardsRequired,
    cardsUsed,
    wildCardsUsed: wildUsed,
    gemsUsed,
    xpGained: xpGain,
    efficiencyRatio,
    materialEfficiency
  };
}

function calculateKingStatus(totalXp: number, startIndex: number = 0): { profile: PlayerProfile, index: number } {
  let currentIndex = startIndex;
  
  while (
    currentIndex < KING_XP_TABLE.length - 1 && 
    totalXp >= KING_XP_TABLE[currentIndex + 1].cumulative
  ) {
    currentIndex++;
  }

  const current = KING_XP_TABLE[currentIndex];
  const xpInto = totalXp - current.cumulative;

  return {
    profile: {
      kingLevel: current.level,
      xpIntoLevel: xpInto
    },
    index: currentIndex
  };
}

const QuartermasterKernel = {
  
  /**
   * 🚀 CORE ENGINE: Generates the optimization plan.
   */
  optimize(
    data: PlayerData,
    settings: OptimizationSettings
  ): OptimizationResult {
    
    const simCards: Mutable<Card>[] = data.cards.map(c => ({ 
      name: c.name,
      rarity: c.rarity,
      level: c.level,
      count: c.count
    }));

    const simInventory: Mutable<Inventory> = {
      gold: data.inventory.gold,
      gems: data.inventory.gems,
      wildCards: { ...data.inventory.wildCards }
    };
    
    const totalWildCardsUsed: Record<Rarity, number> = {
      Common: 0, Rare: 0, Epic: 0, Legendary: 0, Champion: 0
    };
    
    let currentTotalXp = 0;
    const initialKingRowIndex = KING_XP_TABLE.findIndex(k => k.level === data.profile.kingLevel);
    const startRow = initialKingRowIndex >= 0 ? KING_XP_TABLE[initialKingRowIndex] : KING_XP_TABLE[0];
    currentTotalXp = startRow.cumulative + data.profile.xpIntoLevel;
    
    let currentKingIndex = Math.max(0, initialKingRowIndex);

    const upgrades: UpgradeAction[] = [];
    let totalGoldSpent = 0;
    let totalGemsSpent = 0;
    let totalXpGained = 0;

    let activeIndices: number[] = simCards
      .map((_, i) => i)
      .filter(i => simCards[i].level < CARD_LEVEL_CAP);

    const EPSILON = 1e-9;

    while (activeIndices.length > 0) {
      let bestCandidate: UpgradeCandidate | null = null;
      const nextActiveIndices: number[] = [];

      for (const index of activeIndices) {
        const candidate = buildCandidate(
          simCards[index], 
          index, 
          simInventory, 
          settings
        );

        if (!candidate) continue;

        nextActiveIndices.push(index);

        if (!bestCandidate) {
          bestCandidate = candidate;
          continue;
        }

        if (candidate.efficiencyRatio < bestCandidate.efficiencyRatio - EPSILON) {
          bestCandidate = candidate;
        } 
        else if (Math.abs(candidate.efficiencyRatio - bestCandidate.efficiencyRatio) <= EPSILON) {
          if (candidate.gemsUsed < bestCandidate.gemsUsed) {
            bestCandidate = candidate;
          } else if (candidate.gemsUsed === bestCandidate.gemsUsed) {
            if (candidate.goldCost < bestCandidate.goldCost) {
              bestCandidate = candidate;
            } else if (candidate.goldCost === bestCandidate.goldCost) {
              if (candidate.xpGained > bestCandidate.xpGained) {
                bestCandidate = candidate;
              }
            }
          }
        }
      }

      activeIndices = nextActiveIndices;

      if (!bestCandidate) break;

      const targetCard = simCards[bestCandidate.index];
      
      targetCard.level = bestCandidate.toLevel;
      targetCard.count -= bestCandidate.cardsUsed;

      if (!settings.infiniteGold) {
        simInventory.gold -= bestCandidate.goldCost;
      }
      simInventory.gems -= bestCandidate.gemsUsed;
      
      const wildKey = targetCard.rarity as Rarity;
      (simInventory.wildCards as Record<Rarity, number>)[wildKey] -= bestCandidate.wildCardsUsed;

      totalWildCardsUsed[targetCard.rarity] += bestCandidate.wildCardsUsed;
      totalGoldSpent += bestCandidate.goldCost;
      totalGemsSpent += bestCandidate.gemsUsed;
      totalXpGained += bestCandidate.xpGained;
      currentTotalXp += bestCandidate.xpGained;

      let upgradeType: "Direct" | "Wild" | "Gem" = "Direct";
      if (bestCandidate.gemsUsed > 0) upgradeType = "Gem";
      else if (bestCandidate.wildCardsUsed > 0) upgradeType = "Wild";

      upgrades.push({
        cardName: targetCard.name,
        rarity: targetCard.rarity,
        currentLevel: bestCandidate.fromLevel,
        targetLevel: bestCandidate.toLevel,
        goldCost: bestCandidate.goldCost,
        cardCost: bestCandidate.cardsUsed,
        wildCardsUsed: bestCandidate.wildCardsUsed,
        gemsUsed: bestCandidate.gemsUsed,
        xpGained: bestCandidate.xpGained,
        efficiencyRatio: bestCandidate.efficiencyRatio,
        materialEfficiency: bestCandidate.materialEfficiency,
        upgradeType
      });

      if (settings.targetLevel) {
        const kingStatus = calculateKingStatus(currentTotalXp, currentKingIndex);
        currentKingIndex = kingStatus.index;
        if (kingStatus.profile.kingLevel >= settings.targetLevel) break;
      }
    }

    const finalKingStatus = calculateKingStatus(currentTotalXp, currentKingIndex);
    
    return {
      upgrades,
      totalXpGained,
      projectedKingLevel: finalKingStatus.profile.kingLevel,
      finalProfile: {
        ...finalKingStatus.profile,
        name: data.profile.name,
        tag: data.profile.tag
      },
      finalGold: simInventory.gold,
      finalGems: simInventory.gems,
      totalGoldSpent,
      totalGemsSpent,
      totalWildCardsUsed
    };
  }
};

export default QuartermasterKernel;
