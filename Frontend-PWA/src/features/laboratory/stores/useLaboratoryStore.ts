// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { defineStore } from "pinia";
import { ref, computed } from "vue";
import * as v from "valibot";
import { OptimizationSettingsSchema, InventoryOverrideSchema } from "../logic/Schemas";
import type {
  PlayerData,
  OptimizationSettings,
  OptimizationResult,
  Inventory,
  Rarity
} from "../logic/Types";
import { asGold, asGems } from "@core/utils/economy";

export const STORAGE_KEY_SETTINGS = "laboratory_settings";
export const STORAGE_KEY_INVENTORY = "laboratory_inventory";
export const STORAGE_KEY_OBSERVATION = "laboratory_observation";
const STORAGE_KEY_TRACKED_TAG = "laboratory_tracked_tag";

/**
 * LABORATORY STORE - Feature State (Layer 3)
 * ----------------------------------------------------------------------------
 * Rationale: Private state for the Laboratory feature silo.
 * Features: Simulation Persistence, Settings Management, Inventory Overrides.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * This store encapsulates the reactive state for the laboratory simulation.
 * Following Section III of the ADR, Feature-specific state is private to the
 * silo and managed via Pinia.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 3 (@features)
 * - **Import Boundaries:** May import from Layer 1 (@core) and Layer 2 (@shared).
 *   Imports from other Features or Layer 4 (@app) are strictly forbidden.
 * - **Validation Boundary:** While this store manages state, authoritative
 *   data ingestion is performed via the `useLaboratory` composable, which
 *   enforces Valibot validation boundaries defined in `@features/laboratory/logic/Schemas.ts`.
 */
export const useLaboratoryStore = defineStore("laboratory", () => {
  // --- STATE ---

  /**
   * RECTIVE STATE ENGINE: Unified container for Laboratory feature state.
   * Rationale: Simplifies state access by eliminating .value references in actions.
   */
  const state = ref({
    observation: null as PlayerData | null,
    operation: null as OptimizationResult | null,
    isSimulating: false,
    isFetching: false,
    fetchError: null as string | null,
    settings: {
      strategy: "Level Projection" as const,
      allowGemSpending: false,
      infiniteResources: false,
      targetLevel: undefined as number | undefined
    } as OptimizationSettings,
    trackedPlayerTag: localStorage.getItem(STORAGE_KEY_TRACKED_TAG) || null as string | null
  });

  // [GUARD] VALIDATION BOUNDARY: Harden settings ingestion from LocalStorage.
  const getStoredSettings = (): Partial<OptimizationSettings> => {
    const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      if (parsed.strategy === "Target") parsed.strategy = "Level Projection";
      if (parsed.strategy === "Maximize") parsed.strategy = "Resource Efficiency";

      const result = v.safeParse(v.partial(OptimizationSettingsSchema), parsed);
      return result.success ? result.output : {};
    } catch (parseError) {
      console.warn("[LaboratoryStore] Failed to parse stored settings");
      return {};
    }
  };

  // Initial Settings Hydration
  state.value.settings = {
    ...state.value.settings,
    ...getStoredSettings()
  };

  // --- ACTIONS ---

  /**
   * Persists the current player observation to LocalStorage.
   *
   * @remarks
   * Satisfies ADR Section IV: Resilience & Operational Security. Ensures the
   * "Clinical" simulation state survives session restarts or accidental
   * navigation by caching the authoritative PlayerData in LocalStorage.
   *
   * @param data - The player data to persist, or null to clear the cache.
   */
  function persistObservation(data: PlayerData | null) {
    if (data) {
      localStorage.setItem(STORAGE_KEY_OBSERVATION, JSON.stringify(data));
    } else {
      localStorage.removeItem(STORAGE_KEY_OBSERVATION);
    }
  }

  /**
   * Loads inventory overrides from LocalStorage and merges them with a profile.
   *
   * @remarks
   * Satisfies ADR Section III: Validation Boundaries. This action implements
   * the "Inventory Override" pattern, allowing users to simulate scenarios
   * with hypothetical resources while ensuring the resulting Inventory
   * remains structurally valid via Valibot schema enforcement.
   *
   * @param profileData - The base player data containing the default inventory.
   * @returns The merged inventory with overrides applied.
   */
  function loadPersistedInventory(profileData: PlayerData): Inventory {
    const stored = localStorage.getItem(STORAGE_KEY_INVENTORY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const result = v.safeParse(InventoryOverrideSchema, parsed);

        if (result.success) {
          const persisted = result.output;
          return {
            ...profileData.inventory,
            ...persisted,
            gold: asGold(persisted.gold ?? Number(profileData.inventory.gold)),
            gems: asGems(persisted.gems ?? Number(profileData.inventory.gems)),
            wildCards: {
              ...profileData.inventory.wildCards,
              ...(persisted.wildCards || {})
            }
          };
        }
      } catch (parseError) {
        console.warn("[LaboratoryStore] Failed to parse persisted inventory");
      }
    }
    return profileData.inventory;
  }

  /**
   * Updates simulation settings and persists them to LocalStorage.
   *
   * @remarks
   * Satisfies ADR Section III: Control Flow. This action enforces the
   * project's "Simulation Logic" constraints where certain strategies
   * (like Level Projection) strictly require infinite resource parameters
   * for roadmap generation.
   *
   * @param newSettings - Partial settings object to merge.
   */
  function setSettings(newSettings: Partial<OptimizationSettings>) {
    const nextSettings = { ...state.value.settings, ...newSettings };
    if (newSettings.strategy) {
      // Rationale: 'Level Projection' is a roadmap simulation where resources are
      // assumed to be infinite to find the ultimate goal. 'Resource Efficiency'
      // is a constrained simulation based on current inventory.
      nextSettings.infiniteResources = (newSettings.strategy === "Level Projection");
    }
    state.value.settings = nextSettings;
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(state.value.settings));
  }

  /**
   * Updates the current inventory and persists it to LocalStorage.
   *
   * @remarks
   * Satisfies ADR Section III: Validation Boundaries. Performs an atomic
   * update to the reactive inventory state and immediately synchronizes
   * the delta with LocalStorage to ensure session persistence.
   *
   * @param partialInventory - Partial inventory object to merge.
   */
  function updateInventory(partialInventory: Partial<Inventory>) {
    if (!state.value.observation) return;

    const newInventory: Inventory = {
      ...state.value.observation.inventory,
      ...partialInventory,
      gold: asGold(partialInventory.gold !== undefined ? Number(partialInventory.gold) : Number(state.value.observation.inventory.gold)),
      gems: asGems(partialInventory.gems !== undefined ? Number(partialInventory.gems) : Number(state.value.observation.inventory.gems)),
      wildCards: {
        ...state.value.observation.inventory.wildCards,
        ...(partialInventory.wildCards || {})
      }
    };

    state.value.observation = {
      ...state.value.observation,
      inventory: newInventory
    };

    localStorage.setItem(STORAGE_KEY_INVENTORY, JSON.stringify(newInventory));
    persistObservation(state.value.observation);
  }

  /**
   * Sets the active player observation and persists it.
   *
   * @remarks
   * Satisfies ADR Section III: Data Flow. Establishes the authoritative
   * "Source of Truth" for the simulation engine by injecting validated
   * PlayerData into the feature state.
   *
   * @param data - The player data to set.
   */
  function setObservation(data: PlayerData | null) {
    state.value.observation = data;
    persistObservation(data);
  }

  /**
   * Sets the result of the optimization simulation.
   *
   * @remarks
   * Maps the output of the Layer 3 Simulation Engine back to the
   * reactive state container for UI projection.
   *
   * @param result - The optimization result.
   */
  function setOperation(result: OptimizationResult | null) {
    state.value.operation = result;
  }

  /**
   * Updates the simulation active state.
   *
   * @param isSimulating - True if a simulation is running.
   */
  function setSimulating(isSimulating: boolean) {
    state.value.isSimulating = isSimulating;
  }

  /**
   * Updates the data fetching state.
   *
   * @param isFetching - True if data is being fetched.
   */
  function setFetching(isFetching: boolean) {
    state.value.isFetching = isFetching;
  }

  /**
   * Sets the error message if a data fetch fails.
   *
   * @param error - The error message or null to clear.
   */
  function setFetchError(error: string | null) {
    state.value.fetchError = error;
  }
  
  /**
   * Updates the tracked player tag and persists it to LocalStorage.
   *
   * @remarks
   * Satisfies ADR Section VII: Naming Conventions (Identifiers).
   * Maintains the "Tracked Tag" context to enable seamless synchronization
   * across browser sessions.
   *
   * @param tag - The player tag to track.
   */
  function setTrackedPlayerTag(tag: string | null) {
    state.value.trackedPlayerTag = tag;
    if (tag) {
      localStorage.setItem(STORAGE_KEY_TRACKED_TAG, tag);
    } else {
      localStorage.removeItem(STORAGE_KEY_TRACKED_TAG);
    }
  }

  return {
    // State (Exposed as individual refs for storeToRefs compatibility)
    observation: computed(() => state.value.observation),
    settings: computed(() => state.value.settings),
    operation: computed(() => state.value.operation),
    isSimulating: computed(() => state.value.isSimulating),
    isFetching: computed(() => state.value.isFetching),
    fetchError: computed(() => state.value.fetchError),
    trackedPlayerTag: computed(() => state.value.trackedPlayerTag),

    // Actions
    loadPersistedInventory,
    setSettings,
    updateInventory,
    setObservation,
    setOperation,
    setSimulating,
    setFetching,
    setFetchError,
    setTrackedPlayerTag
  };
});
