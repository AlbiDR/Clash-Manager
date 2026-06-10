// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { storeToRefs } from "pinia";
import { useLaboratoryStore } from "../stores/useLaboratoryStore";
import {
  calculateProgressionPath,
  mapStateToResult,
  ProfileHydrator,
  type PlayerProfile,
  type OptimizationSettings,
  type SimulationState
} from '../logic';

/**
 * COMPOSABLE: useLaboratorySimulation
 *
 * @remarks
 * Encapsulates the progression simulation orchestration logic for the Laboratory.
 * Manages the lifecycle of generator-based simulation batches to ensure
 * UI responsiveness (60FPS) during intensive computation.
 *
 * Performance is maintained through requestIdleCallback processing.
 */

// Performance Control Block
let currentSimulationId = 0;

export function useLaboratorySimulation() {
  const store = useLaboratoryStore();
  const {
    observation,
    settings,
  } = storeToRefs(store);

  let currentSimulation: Generator<SimulationState, SimulationState, void> | null = null;

  /**
   * Triggers the progression simulation engine.
   *
   * @remarks
   * Utilizes a generator-based simulation loop processed in ~10ms chunks
   * to maintain UI responsiveness (60FPS).
   */
  function analyze() {
    if (!observation.value) return;

    const simulationId = ++currentSimulationId;
    store.setSimulating(true);

    const currentSettings = settings.value;
    const forceInfinite = currentSettings.strategy === "Level Projection";

    const engineSettings: OptimizationSettings = {
      ...currentSettings,
      infiniteResources: forceInfinite
    };

    const initialState = ProfileHydrator.createInitialState(observation.value);
    const initialTotalXp = Number(initialState.totalXp);
    currentSimulation = calculateProgressionPath(initialState, engineSettings);

    const processBatch = () => {
      // Cancellation check: if a newer simulation has started, abort this one.
      if (simulationId !== currentSimulationId || !currentSimulation) return;

      let latestSimulationState: SimulationState | null = null;
      let batchStartTime = performance.now();
      const BATCH_TIME_MS = 10;

      while (performance.now() - batchStartTime < BATCH_TIME_MS) {
        const { value, done } = currentSimulation.next();
        if (done) {
          if (value && simulationId === currentSimulationId) {
            store.setOperation(mapStateToResult(value, observation.value?.profile as PlayerProfile, initialTotalXp));
          }
          if (simulationId === currentSimulationId) {
            currentSimulation = null;
            store.setSimulating(false);
          }
          return;
        }
        latestSimulationState = value;
      }

      // Update intermediate state for progress feeling - throttled to ~30fps
      if (latestSimulationState && simulationId === currentSimulationId) {
        store.setOperation(mapStateToResult(latestSimulationState, observation.value?.profile as PlayerProfile, initialTotalXp));
      }

      if (window.requestIdleCallback) {
        window.requestIdleCallback(processBatch);
      } else {
        setTimeout(processBatch, 16); // 16ms approx 60fps, but logic uses 10ms budget
      }
    };

    if (window.requestIdleCallback) {
      window.requestIdleCallback(processBatch);
    } else {
      setTimeout(processBatch, 0);
    }
  }

  return {
    analyze
  };
}
