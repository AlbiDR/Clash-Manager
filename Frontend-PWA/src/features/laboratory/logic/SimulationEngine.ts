// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * LABORATORY - Simulation Engine (Layer 3)
 * ----------------------------------------------------------------------------
 * Rationale: Orchestrates the iterative progression simulation.
 * This module coordinates core upgrade logic and scoring strategies to
 * derive optimal player progression paths.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * Architectural Context:
 * - Layer: Layer 3 (@features)
 * - Import Boundaries: Restricted to Layer 1 (@core), internal Feature types,
 *   and companion logic modules (SimulationCore, SimulationMappers).
 *
 * [DECISION LOG] GREEDY OPTIMIZATION:
 * The engine employs a greedy heuristic via a Priority Queue. While not
 * guaranteed to find the absolute global optimum for every edge case of
 * resource depletion, it provides an $O(N \log N)$ approximation that aligns
 * with realistic player upgrade behavior (prioritizing high ROI).
 */

import type {
  SimulationState,
  OptimizationSettings
} from './Types';
import {
  KING_XP_TABLE,
  KING_LEVEL_MAX,
  calculateKingLevel as registryCalculateKingLevel
} from '@core/utils/game';
import { PriorityQueue } from '@core/utils/PriorityQueue';
import { SIMULATION_MAX_ITERATIONS } from '@core';
import type { ScoringStrategy } from './ScoringStrategy';
import { ProjectionStrategy, InventoryStrategy } from './ScoringStrategy';
import {
  getUpgradeCandidate,
  applyUpgrade,
  type ResolvedCandidate
} from './SimulationCore';

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
  const MAX_ITERATIONS = SIMULATION_MAX_ITERATIONS; // Safety break

  // Resolve the strategy: explicit injection wins, then settings-based default.
  const scoringStrategy: ScoringStrategy = strategy ?? (
    settings.strategy === 'Resource Efficiency'
      ? new InventoryStrategy()
      : new ProjectionStrategy()
  );

  const targetLevel = settings.targetLevel || KING_LEVEL_MAX;
  const targetXpRow = KING_XP_TABLE.find(xpRowCandidate => xpRowCandidate.level === targetLevel) ?? KING_XP_TABLE[KING_XP_TABLE.length - 1];
  const targetXp = Number(targetXpRow.cumulative);

  // Initialize Priority Queue with a strategy-based comparator.
  const queue = new PriorityQueue<ResolvedCandidate>((candidateA, candidateB) =>
    scoringStrategy.calculateScore(candidateA, settings) - scoringStrategy.calculateScore(candidateB, settings)
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

export { mapStateToResult } from './SimulationMappers';
