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
 */
export const useLaboratoryStore = defineStore("laboratory", () => {
  // --- STATE ---
  const observation = ref<PlayerData | null>(null);
  const operation = ref<OptimizationResult | null>(null);
  const isSimulating = ref(false);
  const isFetching = ref(false);
  const fetchError = ref<string | null>(null);

  const storedSettings = JSON.parse(localStorage.getItem(STORAGE_KEY_SETTINGS) || "{}");

  // MIGRATION: LEGACY COMPATIBILITY
  if (storedSettings.strategy === "Target") storedSettings.strategy = "Level Projection";
  if (storedSettings.strategy === "Maximize") storedSettings.strategy = "Resource Efficiency";

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
   */
  function setSettings(newSettings: Partial<OptimizationSettings>) {
    const nextSettings = { ...settings.value, ...newSettings };

    // Auto-toggle infiniteResources based on strategy
    if (newSettings.strategy) {
      nextSettings.infiniteResources = (newSettings.strategy === "Level Projection");
    }

    settings.value = nextSettings;
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings.value));
  }

  /**
   * Updates the internal inventory state and persists it.
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

  function setObservation(data: PlayerData | null) {
    observation.value = data;
    persistObservation(data);
  }

  function setOperation(result: OptimizationResult | null) {
    operation.value = result;
  }

  function setSimulating(state: boolean) {
    isSimulating.value = state;
  }

  function setFetching(state: boolean) {
    isFetching.value = state;
  }

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
