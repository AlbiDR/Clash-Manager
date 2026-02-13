/**
 * ============================================================================
 * MODULE: LABORATORY COMPOSABLE
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Logic and state management for the Card Optimization engine.
 * Orchestrates player data ingestion, inventory management, and the
 * simulation of optimal upgrade paths.
 *
 * ARCHITECTURE:
 *  - Domain: Laboratory (Optimization & Simulation).
 *  - Strategy Pattern: Supports multiple optimization targets (Projection, Efficiency).
 *  - Persistence: Multi-tier synchronization with LocalStorage.
 *
 * ROLE: The Architect (Structural Optimization).
 * ============================================================================
 */

import { getPlayerProfile, useClashData } from "@core";
import { ref, computed, type Ref, watch } from 'vue'
import LaboratoryKernel from '../logic/Laboratory_Kernel'
import LaboratoryAdapter from '../logic/Laboratory_Adapter'
import { IMPORTANT_KING_LEVELS } from '../logic/Laboratory_Tables'
import type { 
  PlayerData, 
  OptimizationSettings, 
  OptimizationResult, 
  Inventory 
} from '../logic/Laboratory_Types'

const STORAGE_KEY_SETTINGS = "laboratory_settings";
const STORAGE_KEY_INVENTORY = "laboratory_inventory";
const STORAGE_KEY_OBSERVATION = "laboratory_observation";

/**
 * SINGLETON STATE
 * ----------------------------------------------------------------------------
 * These refs are defined outside the useLaboratory function to ensure that
 * player data and optimization results persist across route changes and
 * component re-mounts without requiring a heavyweight global store (e.g. Pinia).
 * ============================================================================
 */
const observation: Ref<PlayerData | null> = ref(null)

const storedSettings = JSON.parse(localStorage.getItem(STORAGE_KEY_SETTINGS) || "{}");

// MIGRATION: LEGACY COMPATIBILITY
// Ensures that older client versions are gracefully upgraded to the new
// strategy naming convention without losing user preferences.
if (storedSettings.strategy === "Target") storedSettings.strategy = "Projection";
if (storedSettings.strategy === "Maximize") storedSettings.strategy = "Efficiency";

const settings: Ref<OptimizationSettings> = ref({
  strategy: "Projection",
  allowGemSpending: false,
  infiniteResources: false,
  targetLevel: undefined,
  ...storedSettings
})

const operation: Ref<OptimizationResult | null> = ref(null)
const isSimulating = ref(false)
const isFetching = ref(false)
const fetchError = ref<string | null>(null)

/**
 * INVENTORY HYDRATION
 *
 * @remarks
 * Implements a "Partial Override" strategy. Remote profile data is merged with
 * locally-stored manual adjustments to ensure that 'what-if' scenarios
 * (like simulating more Wild Cards) are preserved during session refreshes.
 *
 * @param profileData - Raw data fetched from the Clash Royale API.
 * @returns {Inventory} The blended inventory object.
 */
const loadPersistedInventory = (profileData: PlayerData) => {
  const stored = localStorage.getItem(STORAGE_KEY_INVENTORY);
  if (stored) {
    try {
      const persisted = JSON.parse(stored);
      return {
        ...profileData.inventory,
        ...persisted,
        wildCards: {
          ...profileData.inventory.wildCards,
          ...(persisted.wildCards || {})
        }
      };
    } catch (e) {
      console.warn("[Laboratory] Failed to parse persisted inventory");
    }
  }
  return profileData.inventory;
};

/**
 * PERSISTENCE LAYER
 * Synchronizes the internal PlayerData state with LocalStorage for instant hydration.
 *
 * @param data - The observation state to persist.
 */
function persistObservation(data: PlayerData | null) {
  if (data) {
    localStorage.setItem(STORAGE_KEY_OBSERVATION, JSON.stringify(data));
  } else {
    localStorage.removeItem(STORAGE_KEY_OBSERVATION);
  }
}

/**
 * AUTOMATED TARGETING
 * Determines the next logical King Level milestone to optimize towards.
 *
 * @param currentLevel - The player's current King Level.
 * @returns {number} The target level.
 */
function calculateDefaultTarget(currentLevel: number): number {
  const nextMilestone = IMPORTANT_KING_LEVELS.find(m => m > currentLevel);
  return nextMilestone || (currentLevel + 1);
}

/**
 * COMPOSABLE: useLaboratory
 *
 * @remarks
 * Primary interface for the Laboratory feature. Manages the lifecycle of
 * card optimization simulations and coordinates with the global clash data.
 *
 * @returns
 * - `observation`: Readonly ref of the current player's profile and inventory.
 * - `operation`: Readonly ref of the optimization result (upgrade path).
 * - `settings`: Readonly ref of the user's optimization constraints.
 * - `isSimulating`: Boolean indicating if a simulation is in progress.
 * - `isFetching`: Boolean indicating if a profile fetch is active.
 * - `fetchError`: String containing any error message from the last fetch.
 * - `ingest`: Function to transform and load raw API data into the laboratory.
 * - `updateInventory`: Function to apply manual changes to the player's inventory.
 * - `analyze`: Function to manually trigger a re-simulation.
 * - `setSettings`: Function to update optimization constraints.
 * - `refresh`: Alias for fetchTrackedPlayer.
 *
 * @sideeffects
 * - Reads from and writes to LocalStorage (`laboratory_settings`, `laboratory_inventory`, `laboratory_observation`).
 * - Triggers asynchronous simulations via `LaboratoryKernel`.
 */
export function useLaboratory() {
  const { data: clashData } = useClashData()

  // --- CORE METHODS (Hoisted) ---

  /**
   * OPTIMIZATION TRIGGER
   *
   * @remarks
   * Executes the optimization kernel. Uses `requestAnimationFrame` to ensure
   * that the heavy O(N log N) simulation logic does not block the UI thread,
   * keeping the application responsive during complex calculations.
   */
  function analyze() {
    if (!observation.value) return
    isSimulating.value = true
    
    requestAnimationFrame(() => {
       if (observation.value) {
         operation.value = LaboratoryKernel.optimize(observation.value, settings.value)
       }
       isSimulating.value = false
    })
  }

  /**
   * DATA INGESTION
   * Processes a raw snapshot from the API and hydrates the laboratory state.
   *
   * @param rawSnapshot - The player profile data from the backend.
   * @param rawInventory - Optional manual inventory overrides.
   */
  function ingest(rawSnapshot: any, rawInventory?: any) {
    const data = LaboratoryAdapter.hydrate(rawSnapshot, rawInventory);
    data.inventory = loadPersistedInventory(data);
    observation.value = data;

    // AUTO-TARGET: If no target is set, find the next King Level milestone.
    const currentLevel = data.profile.kingLevel;
    if (!settings.value.targetLevel || settings.value.targetLevel <= currentLevel) {
      settings.value = {
        ...settings.value,
        targetLevel: calculateDefaultTarget(currentLevel)
      };
    }

    persistObservation(observation.value)
    analyze()
  }

  /**
   * REMOTE DATA ACQUISITION
   * Fetches the tracked player's profile from the GAS backend.
   */
  async function fetchTrackedPlayer() {
    const tag = clashData.value?.playerTag
    if (!tag) return

    isFetching.value = true
    fetchError.value = null
    try {
      const profile = await getPlayerProfile(tag)
      ingest(profile)
    } catch (e: any) {
      console.error("[Laboratory] Fetch Failed:", e)
      fetchError.value = e.message || "Failed to fetch player profile"
    } finally {
      isFetching.value = false
    }
  }

  /**
   * INVENTORY MANAGEMENT
   * Updates specific parts of the player's inventory and triggers a re-simulation.
   *
   * @param partialInventory - The changes to apply.
   */
  function updateInventory(partialInventory: Partial<Inventory>) {
    if (!observation.value) return
    
    const newInventory = {
      ...observation.value.inventory,
      ...partialInventory,
      wildCards: {
        ...observation.value.inventory.wildCards,
        ...(partialInventory.wildCards || {})
      }
    }

    observation.value = {
      ...observation.value,
      inventory: newInventory
    }

    localStorage.setItem(STORAGE_KEY_INVENTORY, JSON.stringify(newInventory));
    persistObservation(observation.value);
    analyze()
  }

  /**
   * CONSTRAINT MANAGEMENT
   * Updates the optimization settings and persists them to LocalStorage.
   *
   * @param newSettings - The new optimization constraints.
   */
  function setSettings(newSettings: Partial<OptimizationSettings>) {
    settings.value = { ...settings.value, ...newSettings }
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings.value));
    analyze()
  }

  // --- INITIALIZATION & WATCHERS ---

  // STEP 1: CACHE HYDRATION
  // Attempt to load the last known observation from LocalStorage for an
  // instant initial paint before the network request resolves.
  if (!observation.value) {
    const cached = localStorage.getItem(STORAGE_KEY_OBSERVATION);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && (!clashData.value?.playerTag || parsed.profile.tag === clashData.value.playerTag)) {
          observation.value = parsed;
          analyze();
        }
      } catch (e) {
        console.warn("[Laboratory] Cache hydration failed", e);
      }
    }
  }

  // STEP 2: NETWORK SYNC & RECOVERY
  // Monitor the global player tag and trigger a fetch/re-analysis on change.
  watch(() => clashData.value?.playerTag, (newTag) => {
    if (newTag) {
      if (!observation.value) {
        fetchTrackedPlayer()
      } else {
        analyze()
      }
    }
  }, { immediate: true })

  return {
    observation: computed(() => observation.value),
    operation: computed(() => operation.value),
    settings: computed(() => settings.value),
    isSimulating,
    isFetching,
    fetchError,

    ingest,
    updateInventory,
    analyze,
    setSettings,
    refresh: fetchTrackedPlayer
  }
}
