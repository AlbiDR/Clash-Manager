// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref, computed } from "vue";

/**
 * COMPOSABLE: useSelectionStore
 *
 * @remarks
 * A domain-blind utility for managing a set of selected item identifiers.
 * Facilitates multi-selection modes and batch processing workflows.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 (@core)
 * - **Responsibility:** Pure state management for item selection.
 *
 * @returns Reactive state and handlers for selection operations.
 */
export function useSelectionStore() {
  /** Reactive array of selected item identifiers. */
  const selectedIds = ref<string[]>([]);

  // Selection Mode State
  const isManualSelectionModeForced = ref(false);

  /** Indicates if the UI should be in selection mode. */
  const isSelectionMode = computed(
    () => selectedIds.value.length > 0 || isManualSelectionModeForced.value,
  );

  /**
   * Toggles the selection status of an item.
   * @param id - The unique item identifier.
   */
  function toggleSelect(id: string) {
    const existingIndex = selectedIds.value.indexOf(id);
    if (existingIndex !== -1) {
      selectedIds.value.splice(existingIndex, 1);
    } else {
      selectedIds.value.push(id);
    }
  }

  /**
   * Replaces the current selection with a new set of IDs.
   * @param ids - The new set of identifiers.
   */
  function selectAll(ids: readonly string[]) {
    selectedIds.value = [...ids];
  }

  /**
   * Clears all selections and resets the selection mode.
   */
  function clearSelection() {
    selectedIds.value = [];
    isManualSelectionModeForced.value = false;
  }

  return {
    /** Reactive array of selected item identifiers. */
    selectedIds,
    /** Indicates if the UI should be in selection mode. */
    isSelectionMode,
    /** Toggles the selection status of an item. */
    toggleSelect,
    /** Selects all items in the provided list. */
    selectAll,
    /** Clears all selections. */
    clearSelection,
    /** Manually overrides the selection mode state. */
    setForceSelectionMode: (isForced: boolean) => {
      isManualSelectionModeForced.value = isForced;
    },
  };
}
