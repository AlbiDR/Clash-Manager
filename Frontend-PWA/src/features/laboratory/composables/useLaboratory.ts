// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { getPlayerProfile } from "@core/api/GasClient";
import { useClashDataStore } from "@core";
import { storeToRefs } from "pinia";
import {
  asGold,
  asGems,
} from "@core";
import { computed, watch } from 'vue';
import * as v from "valibot";

// Progression Engine 2.0 Primitives
import {
  calculateProgressionPath,
  mapStateToResult,
  calculateDefaultTarget,
  ProfileHydrator,
  RawInventorySchema,
  type PlayerData,
  type PlayerProfile,
  type OptimizationSettings,
  type SimulationState,
  type Inventory,
  type Rarity,
  type OptimizationResult
} from '../logic';

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
let lastAnalyzedTag: string | null = null;

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
 * - Fetches data from the GAS backend when `playerTag` changes.
 */
export function useLaboratory() {
  const store = useLaboratoryStore();
  const {
    observation,
    operation,
    settings,
    isSimulating,
    isFetching,
    fetchError
  } = storeToRefs(store);

  const clashDataStore = useClashDataStore();
  const { data: clashData } = storeToRefs(clashDataStore);

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
    
    // Prevent redundant analysis if same target already processed
    const currentTag = observation.value.profile.tag;
    if (isSimulating.value && lastAnalyzedTag === currentTag) return;
    lastAnalyzedTag = currentTag;

    const simId = ++currentSimulationId;
    store.setSimulating(true);
    
    const s = settings.value;
    const forceInfinite = s.strategy === "Level Projection";
    
    const engineSettings: OptimizationSettings = {
      ...s,
      infiniteResources: forceInfinite
    };

    const initialState = ProfileHydrator.createInitialState(observation.value);
    const initialTotalXp = Number(initialState.totalXp);
    currentSimulation = calculateProgressionPath(initialState, engineSettings);

    const processBatch = () => {
      // Cancellation check: if a newer simulation has started, abort this one.
      if (simId !== currentSimulationId || !currentSimulation) return;

      let lastState: SimulationState | null = null;
      let startTime = performance.now();
      const BATCH_TIME_MS = 10;
      
      while (performance.now() - startTime < BATCH_TIME_MS) {
        const { value, done } = currentSimulation.next();
        if (done) {
          if (value && simId === currentSimulationId) {
            store.setOperation(mapStateToResult(value, observation.value?.profile as PlayerProfile, initialTotalXp));
          }
          if (simId === currentSimulationId) {
            currentSimulation = null;
            store.setSimulating(false);
          }
          return;
        }
        lastState = value;
      }

      // Update intermediate state for progress feeling - throttled to ~30fps
      if (lastState && simId === currentSimulationId) {
        store.setOperation(mapStateToResult(lastState, observation.value?.profile as PlayerProfile, initialTotalXp));
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
    const data = ProfileHydrator.hydrate(rawSnapshot);

    // If rawInventory is provided, merge it into the data before loading persisted overrides
    if (rawInventory) {
       const invResult = v.safeParse(RawInventorySchema, rawInventory);
       if (invResult.success) {
          const inv = invResult.output;
          data.inventory = {
            ...data.inventory,
            gold: asGold(inv.gold ?? Number(data.inventory.gold)),
            gems: asGems(inv.gems ?? Number(data.inventory.gems)),
            wildCards: {
              ...data.inventory.wildCards,
              Common: inv.wildCards?.Common ?? data.inventory.wildCards.Common,
              Rare: inv.wildCards?.Rare ?? data.inventory.wildCards.Rare,
              Epic: inv.wildCards?.Epic ?? data.inventory.wildCards.Epic,
              Legendary: inv.wildCards?.Legendary ?? data.inventory.wildCards.Legendary,
              Champion: inv.wildCards?.Champion ?? data.inventory.wildCards.Champion,
            }
          };
       } else {
          console.warn("[Laboratory] rawInventory validation failed", invResult.issues);
       }
    }

    data.inventory = store.loadPersistedInventory(data);

    const currentLevel = data.profile.kingLevel;
    if (!settings.value.targetLevel || settings.value.targetLevel <= currentLevel) {
      store.setSettings({
        targetLevel: calculateDefaultTarget(currentLevel)
      });
    }

    store.setObservation(data);
    analyze();
  }

  /**
   * Fetches the profile of the currently tracked player.
   */
  async function fetchTrackedPlayer() {
    const tag = clashData.value?.playerTag;
    if (!tag) return;

    store.setFetching(true);
    store.setFetchError(null);
    try {
      const profile = await getPlayerProfile(tag);
      ingest(profile);
    } catch (e: any) {
      console.error("[Laboratory] Fetch Failed:", e);
      store.setFetchError(e.message || "Failed to fetch player profile");
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
        const currentGlobalTag = clashData.value?.playerTag;
        if (parsed && (!currentGlobalTag || parsed.profile.tag === currentGlobalTag)) {
          // Re-hydrate to ensure branded types and new structure
          const hydrated = ProfileHydrator.hydrate(parsed);
          store.setObservation(hydrated);
          // Only trigger analysis if tags match or no tag filter applied
          analyze();
        }
      } catch (e) {
        console.warn("[Laboratory] Cache hydration failed", e);
      }
    }
  }

  watch(() => clashData.value?.playerTag, (newTag, oldTag) => {
    if (newTag && newTag !== oldTag) {
      if (!observation.value || observation.value.profile.tag !== newTag) {
        fetchTrackedPlayer();
      } else {
        analyze();
      }
    }
  }, { immediate: false }); // Initial run handled by hydration block above

  /**
   * SYSTEM STATUS RESOLVER
   */
  const status = computed(() => {
    if (isFetching.value) return { type: "loading", text: "Scanning Vault..." } as const;
    if (isSimulating.value) return { type: "loading", text: "Computing Trajectory..." } as const;
    if (fetchError.value) return { type: "error", text: "Extraction Failed" } as const;
    if (!clashData.value?.playerTag) return { type: "ready", text: "Target Required" } as const;
    return { type: "ready", text: "Engine Operational" } as const;
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
    loading: isFetching.value,
    isEmpty: isEmpty.value,
    syncError: fetchError.value || undefined,
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

    ingest,
    updateInventory: store.updateInventory,
    analyze,
    setSettings: store.setSettings,
    handleVaultUpdate,
    refresh: fetchTrackedPlayer
  };
}
