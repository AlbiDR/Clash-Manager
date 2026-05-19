// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref } from "vue";
import * as v from "valibot";
import { RecruitTombstoneSchema } from "@core/api/DataSchemas";

const STORAGE_KEY = "cm_recruit_tombstones";

// Singleton state to share across components
const tombstones = ref<Set<string>>(new Set());
const isInitialized = ref(false);

/**
 * COMPOSABLE: useRecruitBlacklist
 *
 * @remarks
 * Manages local "tombstones" for recruits who have been dismissed but might
 * still appear in cached server payloads. This acts as a Layer 3 feature-level
 * persistence driver, bridging the gap between optimistic UI removals and
 * eventual server-side consistency.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 3 (@features)
 * - **Import Boundaries:** Imports from Layer 1 (@core).
 *
 * **Behavioral Logic:**
 * - Hydrates tombstone state from LocalStorage on initialization.
 * - Enforces a Valibot validation boundary for persisted data.
 * - Implements a garbage collection (pruning) strategy to clear tombstones
 *   once they are confirmed to be absent from the server payload.
 *
 * @returns
 * - `tombstones`: Reactive Set of dismissed recruit IDs.
 * - `hide`: Adds IDs to the blacklist and persists.
 * - `restore`: Removes IDs from the blacklist (e.g., for Undo).
 * - `prune`: Synchronizes the blacklist with the authoritative server state.
 */
export function useRecruitBlacklist() {
  function init() {
    if (isInitialized.value) return;
    try {
      const rawTombstoneData = localStorage.getItem(STORAGE_KEY);
      if (rawTombstoneData) {
        const unvalidatedTombstones = JSON.parse(rawTombstoneData);

        // [DECISION LOG] VALIDATION BOUNDARY
        // Rationale: Corrupted or malicious LocalStorage data must be rejected
        // at the entry point to prevent poisoning the recruitment filter logic.
        const result = v.safeParse(RecruitTombstoneSchema, unvalidatedTombstones);

        if (result.success) {
          tombstones.value = new Set(result.output);
        } else {
          console.warn("[Blacklist] Storage validation failed", result.issues);
        }
      }
    } catch (hydrationError: unknown) {
      // THREAT: Eliminated anemic variable 'e'. Using unknown for exception narrowing.
      console.warn("[Blacklist] Failed to load recruit blacklist", hydrationError instanceof Error ? hydrationError.message : String(hydrationError));
    }
    isInitialized.value = true;
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...tombstones.value]));
    } catch (e) {
      // THREAT: Persistent write failure could lead to UI/Server desync on reload.
      console.error("Failed to save recruit blacklist", e);
    }
  }

  function hide(ids: string[]) {
    ids.forEach((id) => tombstones.value.add(id));
    save();
  }

  function restore(ids: string[]) {
    ids.forEach((id) => tombstones.value.delete(id));
    save();
  }

  /**
   * SERVER-AUTHORITATIVE SYNC
   *
   * @remarks
   * Merges the server's blacklist into the local tombstone set.
   * When `forceReplace` is true (boot-time path), the local set is completely
   * rebuilt from the server payload, making `drivers.recruit_blacklist` the SSOT.
   * This prevents cross-device desync where a device cleared its local storage
   * but the server-side blacklist still holds the dismissed state.
   *
   * @param remoteBlacklist - The authoritative list of dismissed player tags.
   * @param forceReplace - If true, replaces the local tombstone set entirely.
   */
  function syncRemote(remoteBlacklist: readonly string[], forceReplace = false) {
    // [FIX] GUARD RELAXED FOR FORCE-REPLACE:
    // A forceReplace with an empty array is valid — it means the server has no
    // blacklisted players and the local tombstone set should be cleared.
    // Only skip if this is a non-authoritative merge with nothing to add.
    if (!forceReplace && (!remoteBlacklist || remoteBlacklist.length === 0)) return;

    if (forceReplace) {
      // [FIX] AUTHORITATIVE REPLACEMENT: Rebuild tombstone set from server SSOT.
      // Rationale: Resolves cross-device desync. A factory-reset device has an
      // empty localStorage, but the server's recruit_blacklist is the ground truth.
      // Merging would be incomplete; only a full replacement guarantees parity.
      const incomingSet = new Set(remoteBlacklist);
      if (incomingSet.size === tombstones.value.size && [...incomingSet].every(id => tombstones.value.has(id))) {
        return; // Already in sync, no write needed.
      }
      tombstones.value = incomingSet;
      save();
      return;
    }

    let added = false;
    remoteBlacklist.forEach((id) => {
      if (!tombstones.value.has(id)) {
        tombstones.value.add(id);
        added = true;
      }
    });
    if (added) {
      save();
    }
  }

  /**
   * GARBAGE COLLECTION
   *
   * @remarks
   * Removes IDs from local storage if they are NO LONGER in the server payload.
   * This implies the server has processed the delete, so we don't need to track it locally anymore.
   *
   * @param currentServerIds - List of IDs currently returned by the API.
   */
  function prune(currentServerIds: string[]) {
    if (currentServerIds.length === 0) return; // Don't prune on empty/error states

    const serverSet = new Set(currentServerIds);
    const toDelete: string[] = [];

    // [DECISION LOG] PRUNING STRATEGY
    // Rationale: If the server doesn't have it, it's gone for good. Remove tombstone.
    // If the server STILL has it (stale cache), keep tombstone to hide it.
    tombstones.value.forEach((id) => {
      if (!serverSet.has(id)) {
        toDelete.push(id);
      }
    });

    if (toDelete.length > 0) {
      toDelete.forEach((id) => tombstones.value.delete(id));
      save();
    }
  }

  // Initialize on import
  init();

  return {
    tombstones,
    hide,
    restore,
    prune,
    syncRemote,
  };
}
