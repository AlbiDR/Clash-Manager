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
 * Strategy 1: Formulaic Efficiency (Divergent from Magic Numbers)
 * Uses a mathematical decay curve instead of hardcoded overrides.
 */
export class FormulaicStrategy implements ScoringStrategy {
  calculateScore(candidate: UpgradeCandidate, settings: OptimizationSettings): number {
    const { toLevel, goldCost, gemsUsed, xpGained } = candidate;
    
    // Effective cost using the standardized factor
    const effectiveCost = Number(goldCost) + (Number(gemsUsed) * GEM_TO_GOLD_FACTOR);
    
    // Base Ratio (Lower is better)
    let score = effectiveCost / (Number(xpGained) || 1);

    // Apply Growth Curve instead of hardcoded overrides
    // This model prioritizes high levels (15, 16) increasingly
    if (toLevel >= 15) {
      // Curve: Reduces score (increases priority) for high-impact levels. 
      // f(15) ~ 0.35, f(16) ~ 0.18
      const incentive = 1 + (Math.pow(Math.max(0, toLevel - 13), 1.8));
      score /= incentive;
    }

    // Gem Penalty (Native Heuristic)
    if (Number(gemsUsed) > 0) {
      score *= settings.infiniteResources ? 1.05 : 10.0;
    } else {
      score *= 0.5; // Material efficiency bonus
    }

    return score;
  }
}

/**
 * Strategy 2: Lookahead Efficiency (Algorithmic Superiority)
 * Evaluates the NEXT potential step to avoid greedy traps.
 */
export class LookaheadStrategy extends FormulaicStrategy {
  constructor(private lookaheadWeight: number = 0.4) {
    super();
  }

  // Note: Implementation will be handled in Simulation.ts 
  // by calling calculateScore on the next possible step.
}
