// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * LABORATORY - Scoring Strategy Patterns (Layer 3)
 * ----------------------------------------------------------------------------
 * Rationale: Decouples the "selection brain" from the progression engine.
 * This allows the simulation to switch between 'Idealistic' (Milestone-driven)
 * and 'Realistic' (Efficiency-driven) progression paths without altering the
 * core iterative loop.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * Architectural Context:
 * - Layer: Layer 3 (@features)
 * - Import Boundaries: Restricted to Layer 1 (@core) and internal Feature types.
 *   Forbidden from importing from Layer 4 (@app) or other Features.
 */

import type { Card, OptimizationSettings, UpgradeCandidate } from './Types';
import { GEM_TO_GOLD_FACTOR } from '@core/utils/economy';

/**
 * Interface for progression scoring logic.
 *
 * @remarks
 * The engine uses a Priority Queue where the candidate with the LOWEST score
 * is selected first. Strategies must return a numerical value representing the
 * "cost-per-benefit" ratio.
 */
export interface ScoringStrategy {
  /**
   * Calculates a priority score for an upgrade candidate.
   *
   * @param candidate - The upgrade step being evaluated.
   * @param settings - User-defined simulation constraints.
   * @returns A numerical score (Lower = Higher Priority).
   */
  calculateScore(candidate: UpgradeCandidate, settings: OptimizationSettings): number;
}

/**
 * Strategy: Level Projection (Infinite/Idealistic)
 *
 * @remarks
 * This strategy prioritizes reaching high-impact level milestones (15, 16)
 * as quickly as possible. It assumes that resources are either infinite or
 * will be acquired over a long enough timeline that short-term efficiency
 * is secondary to long-term account progression.
 */
export class ProjectionStrategy implements ScoringStrategy {
  /**
   * Calculates a milestone-biased score.
   *
   * @param candidate - The upgrade candidate.
   * @param settings - Simulation settings.
   * @returns The weighted score.
   */
  calculateScore(candidate: UpgradeCandidate, settings: OptimizationSettings): number {
    const { toLevel, goldCost, gemsUsed, xpGained } = candidate;
    
    // Rationale: Theoretical Gems are weighted at 10% of their market value
    // because projection mode assumes long-term resource acquisition.
    const effectiveCost = Number(goldCost) + (Number(gemsUsed) * GEM_TO_GOLD_FACTOR * 0.1);
    
    // Base Ratio: Cost per 1 XP gained.
    let score = effectiveCost / (Number(xpGained) || 1);

    // Milestones: Level 15 and 16 provide massive XP jumps.
    // Rationale: We apply a non-linear incentive to "pull" the simulator toward these levels.
    // The exponent 2.5 ensures that as we approach the cap, the relative "attraction"
    // of the milestone increases exponentially, overcoming standard cost barriers.
    if (toLevel >= 15) {
      const incentive = 1 + (Math.pow(Math.max(0, toLevel - 13), 2.5));
      score /= incentive;
    }

    // Small penalty for gems to prefer direct gold/card upgrades when ROI is equal.
    if (Number(gemsUsed) > 0) score *= 1.1;

    return score;
  }
}

/**
 * Strategy: Resource Efficiency (Finite/Realistic)
 *
 * @remarks
 * This strategy focuses on maximizing immediate Return on Investment (ROI).
 * It treats Gems as a premium, finite resource and ignores long-term milestones
 * in favor of the cheapest available XP packets.
 */
export class InventoryStrategy implements ScoringStrategy {
  /**
   * Calculates a ROI-biased score.
   *
   * @param candidate - The upgrade candidate.
   * @param settings - Simulation settings.
   * @returns The weighted score.
   */
  calculateScore(candidate: UpgradeCandidate, settings: OptimizationSettings): number {
    const { goldCost, gemsUsed, xpGained } = candidate;

    // Rationale: Gems are extremely "expensive" (50x multiplier) to force the
    // engine to exhaust all gold-based upgrades before suggesting gem spending.
    const effectiveCost = Number(goldCost) + (Number(gemsUsed) * GEM_TO_GOLD_FACTOR * 50);

    // Strict ROI: Pure cost-efficiency without milestone bias.
    let score = effectiveCost / (Number(xpGained) || 1);

    return score;
  }
}

/**
 * Utility: Lookahead Wrapper (Legacy Compatibility)
 *
 * @remarks
 * Evaluates the NEXT potential step to avoid greedy local optima.
 * Note: The actual lookahead recursion logic is implemented in `Simulation.ts`
 * to leverage the central engine's state management.
 */
export class LookaheadStrategy extends ProjectionStrategy {
  /**
   * @param lookaheadWeight - The weight applied to future steps (0.0 to 1.0).
   */
  constructor(private lookaheadWeight: number = 0.4) {
    super();
  }
}
