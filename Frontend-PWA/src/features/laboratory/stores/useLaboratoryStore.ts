// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { defineStore } from "pinia";
import { ref } from "vue";
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
   * REACTIVE STATE: The currently active player profile and inventory.
   * Hydrated from LocalStorage on initialization or via API ingestion.
   */
  const observation = ref<PlayerData | null>(null);

  /**
   * REACTIVE STATE: The output of the most recent progression simulation.
   */
  const operation = ref<OptimizationResult | null>(null);

  /**
   * REACTIVE STATE: Boolean flag indicating if the simulation engine is running.
   */
  const isSimulating = ref(false);

  /**
   * REACTIVE STATE: Boolean flag indicating if a profile fetch is in progress.
   */
  const isFetching = ref(false);

  /**
   * REACTIVE STATE: Error message string if the most recent fetch operation failed.
   */
  const fetchError = ref<string | null>(null);

  const storedSettings = JSON.parse(localStorage.getItem(STORAGE_KEY_SETTINGS) || "{}");

  // MIGRATION: LEGACY COMPATIBILITY
  // Rationale: Ensure users with old strategy names are migrated to prevent simulation mismatch.
  if (storedSettings.strategy === "Target") storedSettings.strategy = "Level Projection";
  if (storedSettings.strategy === "Maximize") storedSettings.strategy = "Resource Efficiency";

  /**
   * REACTIVE STATE: User-defined constraints for the optimization engine.
   * Persistence: Writes to LocalStorage (STORAGE_KEY_SETTINGS) on every update.
   */
  const settings = ref<OptimizationSettings>({
    strategy: "Level Projection",
    allowGemSpending: false,
    infiniteResources: false,
    targetLevel: undefined,
    ...storedSettings
  });

  // --- ACTIONS ---

  /**
   * Persists the current player observation to LocalStorage.
   *
   * @param data - The player data to persist, or null to clear the cache.
   * @sideEffects Writes to/removes from LocalStorage (STORAGE_KEY_OBSERVATION).
   */
  function persistObservation(data: PlayerData | null) {
    if (data) {
      localStorage.setItem(STORAGE_KEY_OBSERVATION, JSON.stringify(data));
    } else {
      localStorage.removeItem(STORAGE_KEY_OBSERVATION);
    }
  }

  /**
   * Merges persisted inventory overrides with the hydrated player profile data.
   *
   * @param profileData - The authoritative profile data from the API/cache.
   * @returns A merged inventory object including local overrides.
   */
  function loadPersistedInventory(profileData: PlayerData): Inventory {
    const stored = localStorage.getItem(STORAGE_KEY_INVENTORY);
    if (stored) {
      try {
        const persisted = JSON.parse(stored);
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
      } catch (e) {
        console.warn("[LaboratoryStore] Failed to parse persisted inventory");
      }
    }
    return profileData.inventory;
  }

  /**
   * Updates Laboratory optimization settings and persists them.
   *
   * @param newSettings - Partial settings object to merge.
   * @sideEffects Persists merged settings to LocalStorage.
   */
  function setSettings(newSettings: Partial<OptimizationSettings>) {
    const nextSettings = { ...settings.value, ...newSettings };

    // Auto-toggle infiniteResources based on strategy
    // Rationale: Level Projection assumes unlimited resources to find the fastest path.
    if (newSettings.strategy) {
      nextSettings.infiniteResources = (newSettings.strategy === "Level Projection");
    }

    settings.value = nextSettings;
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings.value));
  }

  /**
   * Updates the internal inventory state and persists it.
   *
   * @param partialInventory - Partial inventory object containing overrides.
   * @sideEffects Persists full inventory to LocalStorage and triggers observation update.
   */
  function updateInventory(partialInventory: Partial<Inventory>) {
    if (!observation.value) return;

    const newInventory: Inventory = {
      ...observation.value.inventory,
      ...partialInventory,
      gold: asGold(partialInventory.gold !== undefined ? Number(partialInventory.gold) : Number(observation.value.inventory.gold)),
      gems: asGems(partialInventory.gems !== undefined ? Number(partialInventory.gems) : Number(observation.value.inventory.gems)),
      wildCards: {
        ...observation.value.inventory.wildCards,
        ...(partialInventory.wildCards || {})
      }
    };

    observation.value = {
      ...observation.value,
      inventory: newInventory
    };

    localStorage.setItem(STORAGE_KEY_INVENTORY, JSON.stringify(newInventory));
    persistObservation(observation.value);
  }

  /**
   * Authoritatively sets the active player observation.
   *
   * @param data - Hydrated player data.
   * @sideEffects Triggers LocalStorage persistence via persistObservation.
   */
  function setObservation(data: PlayerData | null) {
    observation.value = data;
    persistObservation(data);
  }

  /**
   * Updates the active simulation result.
   *
   * @param result - Output from the progression engine.
   */
  function setOperation(result: OptimizationResult | null) {
    operation.value = result;
  }

  /**
   * Toggles the simulation processing state.
   *
   * @param state - Current engine state.
   */
  function setSimulating(state: boolean) {
    isSimulating.value = state;
  }

  /**
   * Toggles the API fetch state.
   *
   * @param state - Current network status.
   */
  function setFetching(state: boolean) {
    isFetching.value = state;
  }

  /**
   * Sets the current error state for profile retrieval.
   *
   * @param error - Sanitized error message or null.
   */
  function setFetchError(error: string | null) {
    fetchError.value = error;
  }

  return {
    // State
    observation,
    settings,
    operation,
    isSimulating,
    isFetching,
    fetchError,

    // Actions
    loadPersistedInventory,
    setSettings,
    updateInventory,
    setObservation,
    setOperation,
    setSimulating,
    setFetching,
    setFetchError
  };
});
