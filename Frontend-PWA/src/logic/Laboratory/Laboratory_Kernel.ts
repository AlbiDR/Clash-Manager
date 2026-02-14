
/**
 * ============================================================================
 * ⚡ MODULE: LABORATORY KERNEL
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
} from './Laboratory_Tables';

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
} from './Laboratory_Types';

const EPSILON = 1e-9;

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

  // 1. If infinite, we bypass material checks but keep track for summary consistency.
  // 2. If real, we try cards -> wild cards -> gems (if allowed).
  // 3. Tower Troops CANNOT use wildcards.
  const wildAvailable = (card.isTowerTroop) ? 0 : (inventory.wildCards[card.rarity] || 0);
  let gemsUsed = 0;
  let finalWildUsed = 0;

  if (settings.infiniteResources) {
    // In infinite mode, we conceptually use what we need, 
    // but for the summary we prioritize the "owned" count first.
    finalWildUsed = remainingNeeded;
    
    // Theoretical Gem calculation for card/material deficit
    const deficit = Math.max(0, remainingNeeded - wildAvailable);
    if (deficit > 0 && settings.allowGemSpending) {
      const rate = GEM_CONVERSION_RATES[card.rarity] || 1;
      gemsUsed += Math.ceil(deficit * rate);
    }

    // Theoretical Gem calculation for gold deficit
    if (goldCost > inventory.gold && settings.allowGemSpending) {
      const goldDeficit = goldCost - Math.max(0, inventory.gold);
      const gemsForGold = Math.ceil(goldDeficit / GEM_VALUE_IN_GOLD);
      gemsUsed += gemsForGold;
    }
  } else {
    // Real resources mode
    const wildToUse = Math.min(remainingNeeded, Math.max(0, wildAvailable));
    finalWildUsed = wildToUse;
    remainingNeeded -= wildToUse;

    if (remainingNeeded > 0) {
      if (settings.allowGemSpending) {
        const rate = GEM_CONVERSION_RATES[card.rarity] || 1;
        gemsUsed = Math.ceil(remainingNeeded * rate);
        
        // Check gem budget
        if (gemsUsed > inventory.gems) return null;
      } else {
        // Cannot satisfy material requirement
        return null;
      }
    }

    // Gold check (only in non-infinite mode)
    if (goldCost > inventory.gold) {
      if (settings.allowGemSpending) {
        const goldDeficit = goldCost - Math.max(0, inventory.gold);
        const gemsForGold = Math.ceil(goldDeficit / GEM_VALUE_IN_GOLD);
        gemsUsed += gemsForGold;
        
        // Re-verify total gem budget
        if (gemsUsed > inventory.gems) return null;
      } else {
        return null;
      }
    }
  }

  // Convert gems to gold value for normalized efficiency comparison
  const effectiveCost = goldCost + (gemsUsed * GEM_VALUE_IN_GOLD);

  const override = EFFICIENCY_OVERRIDES[nextLevel];
  let efficiencyRatio = override !== undefined 
    ? override 
    : effectiveCost / xpGain;

  // PRIORITY LOGIC:
  // We apply a "Gem Penalty" (efficiency penalty) if gems are required.
  // This ensures that the greedy algorithm prioritizes "free" upgrades 
  // (using owned cards/wildcards) over spending gems.
  if (gemsUsed > 0) {
    if (settings.infiniteResources) {
      // PROJECTION STABILIZATION:
      // In infinite simulation, we don't want the path to change drastically 
      // just because we switched to "pay" mode. We remove the massive penalty
      // so the optimizer still picks the best "XP per Gold" upgrades, 
      // just calculating their Gem cost as a side effect.
      efficiencyRatio *= 1.05; // Slight bias against pure gem spending, but not 10x
    } else {
      efficiencyRatio *= 10.0; // 10x penalty for real resource constraints (Resource Efficiency)
    }
  } else {
    efficiencyRatio *= 0.5; // 50% "Owned Material" bonus to prioritize natural growth
  }

  const materialEfficiency = cardsRequired > 0 ? xpGain / cardsRequired : 0;
  const xpPerGold = goldCost > 0 ? xpGain / goldCost : 0;
  const xpPerGem = gemsUsed > 0 ? xpGain / gemsUsed : 0;

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
    efficiencyRatio,
    materialEfficiency,
    xpPerGold,
    xpPerGem,
    isTowerTroop: card.isTowerTroop
  };
}

function calculateKingStatus(totalXp: number, startIndex: number = 0): { profile: Pick<PlayerProfile, "kingLevel" | "xpIntoLevel">, index: number } {
  let currentIndex = startIndex;
  
  while (
    currentIndex < KING_XP_TABLE.length - 1 && 
    totalXp >= KING_XP_TABLE[currentIndex + 1].cumulative
  ) {
    currentIndex++;
  }

  const current = KING_XP_TABLE[currentIndex];
  // Calculate remainder correctly
  const xpInto = totalXp - current.cumulative;

  return {
    profile: {
      kingLevel: current.level,
      xpIntoLevel: xpInto
    },
    index: currentIndex
  };
}

const LaboratoryKernel = {
  
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
      count: c.count,
      isTowerTroop: c.isTowerTroop
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

    // STRATEGY DIVERGENCE:
    // - Projection: ALWAYS Infinite (Goal Oriented Simulation)
    // - Efficiency: Defaults to Finite, but can be forced Infinite for simulation
    const effectiveInfinite = settings.strategy === "Projection" || settings.infiniteResources;
    const candidateSettings = { ...settings, infiniteResources: effectiveInfinite };

    const candidates = new Array<UpgradeCandidate | null>(simCards.length).fill(null);
    const dirtyIndices = new Set<number>(simCards.keys());

    while (true) {
      // 1. RE-EVALUATE DIRTY CANDIDATES
      // Instead of O(N) every step, we only update cards affected by the last action.
      for (const index of dirtyIndices) {
        if (simCards[index].level < CARD_LEVEL_CAP) {
          candidates[index] = buildCandidate(
            simCards[index],
            index,
            simInventory,
            candidateSettings
          );
        } else {
          candidates[index] = null;
        }
      }
      dirtyIndices.clear();

      // 2. FIND BEST CANDIDATE (O(N))
      let bestCandidate: UpgradeCandidate | null = null;

      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        if (!candidate) continue;

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

      if (!bestCandidate) break;

      const bestIndex = bestCandidate.index;
      const targetCard = simCards[bestIndex];
      
      targetCard.level = bestCandidate.toLevel;
      targetCard.count -= bestCandidate.cardsUsed;
      
      // 3. BUDGET MANAGEMENT
      // Only deduct cost if NOT in infinite mode.
      if (!effectiveInfinite) {
        simInventory.gold -= bestCandidate.goldCost;
        simInventory.gems -= bestCandidate.gemsUsed;
      }
      
      const wildKey = targetCard.rarity as Rarity;
      (simInventory.wildCards as Record<Rarity, number>)[wildKey] -= bestCandidate.wildCardsUsed;

      // 4. MARK DIRTY INDICES FOR NEXT ITERATION
      dirtyIndices.add(bestIndex);

      // If wildcards were used, all cards of that rarity might have changed their gem requirement
      if (bestCandidate.wildCardsUsed > 0) {
        for (let i = 0; i < simCards.length; i++) {
          if (i !== bestIndex && simCards[i].rarity === targetCard.rarity) {
            dirtyIndices.add(i);
          }
        }
      }

      // If gold/gems were spent in finite mode, all cards might have changed affordability
      if (!effectiveInfinite && (bestCandidate.goldCost > 0 || bestCandidate.gemsUsed > 0)) {
        for (let i = 0; i < simCards.length; i++) {
          if (i !== bestIndex) dirtyIndices.add(i);
        }
      }

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
        xpPerGold: bestCandidate.xpPerGold,
        xpPerGem: bestCandidate.xpPerGem,
        upgradeType,
        isTowerTroop: bestCandidate.isTowerTroop
      });

      if (settings.strategy === "Projection" && settings.targetLevel) {
        const kingStatus = calculateKingStatus(currentTotalXp, currentKingIndex);
        currentKingIndex = kingStatus.index;
        if (kingStatus.profile.kingLevel >= settings.targetLevel) break;
      }
    }

    const finalKingStatus = calculateKingStatus(currentTotalXp, currentKingIndex);
    
    return {
      actions: upgrades,
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

export default LaboratoryKernel;
