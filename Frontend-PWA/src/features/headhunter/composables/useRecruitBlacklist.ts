/**
 * 🧹 USE RECRUIT BLACKLIST
 * Manages local "tombstones" for recruits who have been dismissed but might still appear in cached server payloads.
 */
import { ref } from "vue";
import * as v from "valibot";
import { RecruitTombstoneSchema } from "@core/api/DataSchemas";

const STORAGE_KEY = "cm_recruit_tombstones";

// Singleton state to share across components
const tombstones = ref<Set<string>>(new Set());
const isInitialized = ref(false);

export function useRecruitBlacklist() {
  function init() {
    if (isInitialized.value) return;
    try {
      const rawTombstoneData = localStorage.getItem(STORAGE_KEY);
      if (rawTombstoneData) {
        const unvalidatedTombstones = JSON.parse(rawTombstoneData);

        // [GUARD] VALIDATION BOUNDARY: Target B [1]
        // THREAT: Corrupted or malicious LocalStorage data poisoning the recruitment filter.
        const result = v.safeParse(RecruitTombstoneSchema, unvalidatedTombstones);

        if (result.success) {
          tombstones.value = new Set(result.output);
        } else {
          console.warn("[Blacklist] Storage validation failed", result.issues);
        }
      }
    } catch (hydrationError: unknown) {
      // THREAT: Target B [4] - Eliminated anemic variable 'e'.
      console.warn("[Blacklist] Failed to load recruit blacklist", hydrationError instanceof Error ? hydrationError.message : String(hydrationError));
    }
    isInitialized.value = true;
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...tombstones.value]));
    } catch (e) {
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
   * 🧹 GARBAGE COLLECTION
   * Removes IDs from local storage if they are NO LONGER in the server payload.
   * This implies the server has processed the delete, so we don't need to track it locally anymore.
   *
   * @param currentServerIds List of IDs currently returned by the API
   */
  function prune(currentServerIds: string[]) {
    if (currentServerIds.length === 0) return; // Don't prune on empty/error states

    const serverSet = new Set(currentServerIds);
    const toDelete: string[] = [];

    tombstones.value.forEach((id) => {
      // If the server doesn't have it, it's gone for good. Remove tombstone.
      // If the server STILL has it (stale cache), keep tombstone to hide it.
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
  };
}
