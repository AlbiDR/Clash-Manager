import type { Card, OptimizationSettings, UpgradeCandidate } from './Types';
import { GEM_TO_GOLD_FACTOR } from './Economy';

/**
 * ==========================================================
 * Logic Strategy Pattern
 * ==========================================================
 * Decouples the "selection brain" from the "engine".
 */

export interface ScoringStrategy {
  /**
   * Calculates a score for an upgrade candidate.
   * Lower score = Higher priority.
   */
  calculateScore(candidate: UpgradeCandidate, settings: OptimizationSettings): number;
}

/**
 * Strategy: Level Projection (Infinite/Idealistic)
 * Prioritizes high-impact level milestones (15, 16) aggressively.
 * Assumes a long-term goal where resources will eventually be acquired.
 */
export class ProjectionStrategy implements ScoringStrategy {
  calculateScore(candidate: UpgradeCandidate, settings: OptimizationSettings): number {
    const { toLevel, goldCost, gemsUsed, xpGained } = candidate;
    
    // Effective cost (Theoretical Gems are cheap in projection mode)
    const effectiveCost = Number(goldCost) + (Number(gemsUsed) * GEM_TO_GOLD_FACTOR * 0.1);
    
    // Base Ratio
    let score = effectiveCost / (Number(xpGained) || 1);

    // Heavier Growth Curve for Projection
    // We want to force the simulator toward the "mountaintop" (Level 15/16)
    if (toLevel >= 15) {
      const incentive = 1 + (Math.pow(Math.max(0, toLevel - 13), 2.5)); // More aggressive than 1.8
      score /= incentive;
    }

    // Small penalty for gems, mostly just prefers direct upgrades if possible
    if (Number(gemsUsed) > 0) score *= 1.1;

    return score;
  }
}

/**
 * Strategy: Resource Efficiency (Finite/Realistic)
 * Strictly optimizes for XP ROI (Experience per Gold).
 * Heavily penalizes gem spending and resource-heavy transitions.
 */
export class InventoryStrategy implements ScoringStrategy {
  calculateScore(candidate: UpgradeCandidate, settings: OptimizationSettings): number {
    const { goldCost, gemsUsed, xpGained } = candidate;

    // Gems are extremely "expensive" in inventory mode
    const effectiveCost = Number(goldCost) + (Number(gemsUsed) * GEM_TO_GOLD_FACTOR * 50);

    // Strict ROI
    let score = effectiveCost / (Number(xpGained) || 1);

    // In inventory mode, we don't care about milestones as much 
    // as we care about the next most efficient XP packet.
    return score;
  }
}

/**
 * Utility: Lookahead Wrapper (Legacy Compatibility)
 * Evaluates the NEXT potential step to avoid greedy traps.
 */
export class LookaheadStrategy extends ProjectionStrategy {
  constructor(private lookaheadWeight: number = 0.4) {
    super();
  }

  // Note: Implementation will be handled in Simulation.ts 
  // by calling calculateScore on the next possible step.
}
