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
  ProfileHydrator,
  RawInventorySchema,
  type PlayerData,
  type Inventory,
  type UpgradeAction
} from '../logic';

import {
  calculateDefaultTarget,
  normalizeRarity,
  type Rarity
} from '@core';

import { useLaboratoryStore, STORAGE_KEY_OBSERVATION } from "../stores/useLaboratoryStore";
import { useLaboratorySimulation } from "./useLaboratorySimulation";

/**
 * @remarks
 * The Laboratory optimization domain manages the simulation of player progression.
 * Following the CleanStack Architecture (Section III), this composable encapsulates
 * the behavioral logic (simulations, API fetching) while delegating state
 * management to the useLaboratoryStore.
 *
 * It utilizes useLaboratorySimulation for the underlying progression engine
 * orchestration.
 */

/**
 * Primary composable for Laboratory operations.
 *
 * @remarks
 * Orchestrates the full lifecycle of the Laboratory feature, from player
 * ingestion and inventory management to complex progression simulations.
 *
 * [ARCHITECTURE] Satisfies ADR Section III: Presentation Orchestration.
 * Delegates state management to `useLaboratoryStore` and simulation math
 * to `useLaboratorySimulation`, acting as the authoritative interface for
 * the Laboratory view layer.
 *
 * @returns
 * - `observation`: Computed reference to the hydrated PlayerData snapshot.
 * - `operation`: Computed reference to the most recent OptimizationResult.
 * - `settings`: Computed reference to the active OptimizationSettings.
 * - `isSimulating`: Reactive flag indicating active simulation computation.
 * - `isFetching`: Reactive flag indicating active API profile retrieval.
 * - `fetchError`: Reactive error message from the most recent fetch attempt.
 * - `layoutProps`: Unified computed object for driving `ConsoleLayout.vue`.
 * - `layoutEvents`: Standardized event handlers for `ConsoleLayout.vue`.
 * - `ingest`: Method to process raw API data into the laboratory domain.
 * - `updateInventory`: Method to merge partial inventory overrides.
 * - `analyze`: Triggers a manual re-run of the simulation engine.
 * - `setSettings`: Updates optimization strategy and constraints.
 * - `handleVaultUpdate`: High-level entry point for vault-specific UI updates.
 * - `refresh`: Triggers a fresh profile fetch from the backend.
 * - `setTrackedPlayerTag`: Updates the persistent player filter.
 * - `trackedPlayerTag`: Reactive reference to the currently filtered tag.
 * - `getTrajectoryMemoKeys`: Stability helper for `v-memo` trajectory lists.
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

  const { analyze } = useLaboratorySimulation();

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
    } catch (capturedError: unknown) {
      // THREAT: Malformed player profile causing simulation engine crash.
      // Rationale: Explicitly catching hydration failures prevents the engine
      // from running on invalid state and provides feedback to the store.
      const message = capturedError instanceof Error ? capturedError.message : String(capturedError);
      console.error("[Laboratory] Ingestion Failed:", message);
      store.setFetchError(message);
      return;
    }

    // If rawInventory is provided, merge it into the data before loading persisted overrides
    if (rawInventory) {
      // [THREAT:] Unvalidated external inventory ingress.
      // [DECISION LOG] Ensuring structural integrity via RawInventorySchema before
      // permitting the merge into the hydrated domain model.
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

    // [DECISION LOG] LocalStorage overrides take precedence over API-sourced inventory.
    // This enables the "Hypothetical Simulation" use case where a user modifies
    // their local gold/gems to see the impact on their trajectory.
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
    } catch (capturedError: unknown) {
      // THREAT: Network or API failure on profile retrieval.
      const message = capturedError instanceof Error ? capturedError.message : String(capturedError);
      console.error("[Laboratory] Fetch Failed:", message);
      store.setFetchError(message);
    } finally {
      store.setFetching(false);
    }
  }

  // Initial hydration from Cache
  if (!observation.value) {
    // [DECISION LOG] Bootstrapping from LocalStorage to achieve sub-second TTI.
    // We hydrate the previous observation immediately while waiting for any
    // background re-syncs to complete.
    const cached = localStorage.getItem(STORAGE_KEY_OBSERVATION);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        const currentTag = trackedPlayerTag.value || clashData.value?.playerTag;
        if (parsed && (!currentTag || parsed.profile.tag === currentTag)) {
          // Re-hydrate to ensure branded types and new structure
          // [THREAT:] Corrupted or stale LocalStorage state causing silent engine failure.
          // [DECISION LOG] Passing through ProfileHydrator ensures that even cached
          // data adheres to the latest authoritative domain structure.
          const hydrated = ProfileHydrator.hydrate(parsed);
          store.setObservation(hydrated);
          // Only trigger analysis if tags match or no tag filter applied
          analyze();
        }
      } catch (capturedError: unknown) {
        // [THREAT:] JSON parse or hydration failure from corrupt storage.
        console.warn("[Laboratory] Cache hydration failed:", capturedError instanceof Error ? capturedError.message : String(capturedError));
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
      const normalized = normalizeRarity(rawRarity);
      store.updateInventory({
        wildCards: { [normalized]: value } as Partial<Record<Rarity, number>>
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
