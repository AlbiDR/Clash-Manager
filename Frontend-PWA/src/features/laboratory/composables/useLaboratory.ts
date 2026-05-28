// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { getPlayerProfile } from "@core/api/ProfileClient";
import { useClashDataStore } from "@core";
import { storeToRefs } from "pinia";
import {
  asGold,
  asGems,
  formatTimeAgo,
} from "@core";
import { computed, watch } from 'vue';
import * as v from "valibot";

// Progression Engine 2.0 Primitives
import {
  calculateProgressionPath,
  mapStateToResult,
  ProfileHydrator,
  RawInventorySchema,
  type PlayerData,
  type PlayerProfile,
  type OptimizationSettings,
  type SimulationState,
  type Inventory,
  type OptimizationResult,
  type UpgradeAction
} from '../logic';

import {
  calculateDefaultTarget,
  type Rarity
} from '@core';

import { useLaboratoryStore, STORAGE_KEY_OBSERVATION } from "../stores/useLaboratoryStore";

/**
 * @remarks
 * The Laboratory optimization domain manages the simulation of player progression.
 * Following the CleanStack Architecture (Section III), this composable encapsulates
 * the behavioral logic (simulations, API fetching) while delegating state
 * management to the useLaboratoryStore.
 *
 * Performance is maintained through generator-based simulation processing
 * which avoids blocking the main UI thread.
 */

// Performance Control Block
let currentSimulationId = 0;

/**
 * Primary composable for Laboratory operations.
 *
 * @returns {Object} Laboratory state and methods.
 *
 * **Reactive State (Proxied from Store):**
 * - `observation`: Current hydrated player profile and inventory.
 * - `operation`: The result of the current simulation run.
 * - `settings`: User-defined optimization constraints.
 * - `isSimulating`: Boolean indicating if simulation logic is running.
 * - `isFetching`: Boolean indicating if a profile fetch is in progress.
 * - `fetchError`: Error message if the profile fetch fails.
 *
 * **Behavioral Logic:**
 * - Triggers asynchronous simulation via `requestIdleCallback`.
 * - Fetches data from the Supabase backend when `playerTag` changes.
 */
export function useLaboratory() {
  const store = useLaboratoryStore();
  const {
    observation,
    operation,
    settings,
    isSimulating,
    isFetching,
    fetchError,
    trackedPlayerTag
  } = storeToRefs(store);

  const clashDataStore = useClashDataStore();
  const { data: clashData, currentSource, remoteSyncTime } = storeToRefs(clashDataStore);

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
    
    const currentTag = observation.value.profile.tag;

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

  /**
   * Processes raw player snapshot and inventory into the internal hydrated state.
   *
   * @param rawSnapshot - Raw player profile from API.
   * @param rawInventory - Optional inventory overrides.
   */
  function ingest(rawSnapshot: unknown, rawInventory?: unknown) {
    let hydratedData: PlayerData;
    try {
      hydratedData = ProfileHydrator.hydrate(rawSnapshot);
    } catch (err: unknown) {
      // THREAT: Malformed player profile causing simulation engine crash.
      // Rationale: Explicitly catching hydration failures prevents the engine
      // from running on invalid state and provides feedback to the store.
      const message = err instanceof Error ? err.message : String(err);
      console.error("[Laboratory] Ingestion Failed:", message);
      store.setFetchError(message);
      return;
    }

    // If rawInventory is provided, merge it into the data before loading persisted overrides
    if (rawInventory) {
       const inventoryValidation = v.safeParse(RawInventorySchema, rawInventory);
       if (inventoryValidation.success) {
          const validatedInventory = inventoryValidation.output;
          hydratedData.inventory = {
            ...hydratedData.inventory,
            gold: asGold(validatedInventory.gold ?? Number(hydratedData.inventory.gold)),
            gems: asGems(validatedInventory.gems ?? Number(hydratedData.inventory.gems)),
            wildCards: {
              ...hydratedData.inventory.wildCards,
              ...validatedInventory.wildCards
            }
          };
       } else {
          console.warn("[Laboratory] rawInventory validation failed", inventoryValidation.issues);
       }
    }

    hydratedData.inventory = store.loadPersistedInventory(hydratedData);

    const currentLevel = hydratedData.profile.kingLevel;
    if (!settings.value.targetLevel || settings.value.targetLevel <= currentLevel) {
      store.setSettings({
        targetLevel: calculateDefaultTarget(currentLevel)
      });
    }

    store.setObservation(hydratedData);
    analyze();
  }

  /**
   * Fetches the profile of the currently tracked player.
   */
  async function fetchTrackedPlayer() {
    const tag = trackedPlayerTag.value || clashData.value?.playerTag;
    if (!tag) return;

    store.setFetching(true);
    store.setFetchError(null);
    try {
      const profile = await getPlayerProfile(tag);
      ingest(profile);
    } catch (err: unknown) {
      // THREAT: Network or API failure on profile retrieval.
      const message = err instanceof Error ? err.message : String(err);
      console.error("[Laboratory] Fetch Failed:", message);
      store.setFetchError(message);
    } finally {
      store.setFetching(false);
    }
  }

  // Initial hydration from Cache
  if (!observation.value) {
    const cached = localStorage.getItem(STORAGE_KEY_OBSERVATION);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        const currentTag = trackedPlayerTag.value || clashData.value?.playerTag;
        if (parsed && (!currentTag || parsed.profile.tag === currentTag)) {
          // Re-hydrate to ensure branded types and new structure
          // THREAT: Corrupted LocalStorage state causing silent boot failure.
          const hydrated = ProfileHydrator.hydrate(parsed);
          store.setObservation(hydrated);
          // Only trigger analysis if tags match or no tag filter applied
          analyze();
        }
      } catch (err: unknown) {
        // Target B [4]: The 'any' plague eliminated.
        console.warn("[Laboratory] Cache hydration failed:", err instanceof Error ? err.message : String(err));
      }
    } else {
      const initialTag = trackedPlayerTag.value || clashData.value?.playerTag;
      if (initialTag) {
        fetchTrackedPlayer();
      }
    }
  }

  watch(() => trackedPlayerTag.value || clashData.value?.playerTag, (newTag, oldTag) => {
    if (newTag && newTag !== oldTag) {
      if (!observation.value || observation.value.profile.tag !== newTag) {
        fetchTrackedPlayer();
      } else {
        analyze();
      }
    }
  }, { immediate: false });

  // REACTIVITY BRIDGE: Trigger analysis when parameters or inventory change.
  watch(settings, () => {
    analyze();
  }, { deep: true });

  watch(() => observation.value?.inventory, () => {
    analyze();
  }, { deep: true });

  /**
   * SYSTEM STATUS RESOLVER
   */
  const status = computed(() => {
    if (isFetching.value) return { type: "loading", text: "Scanning Vault..." } as const;
    if (isSimulating.value) return { type: "loading", text: "Computing Trajectory..." } as const;
    if (fetchError.value) return { type: "error", text: "Extraction Failed" } as const;
    const tag = trackedPlayerTag.value || clashData.value?.playerTag;
    if (!tag) return { type: "warning", text: "Target Required" } as const;
    return { type: "success", text: "Operational", nominal: true } as const;
  });

  const isEmpty = computed(() => !observation.value && !isFetching.value);

  /**
   * LAYOUT PROPS (Standardized Interface)
   *
   * @remarks
   * Groups reactive properties for ConsoleLayout to minimize view boilerplate.
   */
  const layoutProps = computed(() => ({
    status: status.value,
    loading: isFetching.value && !observation.value,
    isRefreshing: isFetching.value,
    syncError: fetchError.value || undefined,
    isEmpty: isEmpty.value,
    emptyMessage: !(trackedPlayerTag.value || clashData.value?.playerTag) 
      ? 'Target Required' 
      : (fetchError.value || "Target Profile Not Found"),
    emptyHint: !(trackedPlayerTag.value || clashData.value?.playerTag) 
      ? 'No PlayerTag configured. Please enter one above or in Project Properties.' 
      : 'Ensure your inventory is correctly entered in The Vault.',
    emptyIcon: !(trackedPlayerTag.value || clashData.value?.playerTag) ? 'flask' : 'crosshair',
    remoteInfo: currentSource.value ? {
      source: currentSource.value,
      dataAge: remoteSyncTime.value ? formatTimeAgo(remoteSyncTime.value) : null
    } : undefined
  }));

  /**
   * LAYOUT EVENTS (Standardized Interface)
   *
   * @remarks
   * Maps UI events from ConsoleLayout directly to controller methods.
   */
  const layoutEvents = computed(() => ({
    refresh: fetchTrackedPlayer
  }));

  /**
   * UPDATES VAULT INVENTORY
   *
   * @remarks
   * Maps UI update keys (gold, gems, wc_*) to structured inventory updates.
   */
  function handleVaultUpdate(key: string, value: number) {
    const strategy: Record<string, () => void> = {
      gold: () => store.updateInventory({ gold: value }),
      gems: () => store.updateInventory({ gems: value }),
    };

    if (strategy[key]) {
      strategy[key]();
    } else if (key.startsWith('wc_')) {
      const rawRarity = key.split('_')[1] || '';
      const capitalized = (rawRarity.charAt(0).toUpperCase() + rawRarity.slice(1)) as Rarity;
      store.updateInventory({
        wildCards: { [capitalized]: value } as Partial<Record<Rarity, number>>
      });
    }
  }

  return {
    observation: computed(() => observation.value),
    operation: computed(() => operation.value),
    settings: computed(() => settings.value),
    isSimulating,
    isFetching,
    fetchError,
    layoutProps,
    layoutEvents,

    ingest,
    updateInventory: store.updateInventory,
    analyze,
    setSettings: store.setSettings,
    handleVaultUpdate,
    refresh: fetchTrackedPlayer,
    setTrackedPlayerTag: store.setTrackedPlayerTag,
    trackedPlayerTag,

    /**
     * MEMOIZATION KEY GENERATOR
     *
     * @remarks
     * Centralizes the dependency list for Vue's `v-memo` directive.
     * Ensures that trajectory list items only re-render when the recommended
     * upgrade action actually changes, improving performance during simulations.
     *
     * @param upgrade - The upgrade action to memoize.
     * @returns A stable array of dependencies for `v-memo`.
     */
    getTrajectoryMemoKeys: (upgrade: UpgradeAction) => [
      upgrade.cardName,
      upgrade.targetLevel,
      upgrade.efficiencyIndex,
      upgrade.upgradeType
    ],
  };
}
