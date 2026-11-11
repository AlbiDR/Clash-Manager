// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref, computed, type Ref, type ComputedRef } from "vue";

/**
 * Authoritative return contract for `useSelectionStore`.
 *
 * @remarks
 * Encapsulates the reactive state primitives and batch mutation handlers
 * for managing selected entity identifiers across Layer 1 consumers.
 */
export interface UseSelectionStoreReturn {
  /** Reactive array of selected item identifiers. */
  selectedIds: Ref<string[]>;
  /** Indicates if the UI should be in selection mode. */
  isSelectionMode: ComputedRef<boolean>;
  /** Toggles the selection status of an item. */
  toggleSelect: (targetItemId: string) => void;
  /** Selects all items in the provided list. */
  selectAll: (targetItemIds: readonly string[]) => void;
  /** Clears all selections and resets forced selection mode. */
  clearSelection: () => void;
  /**
   * Manually overrides the selection mode state.
   *
   * @param isForced - Whether to force selection mode active even with zero selections.
   */
  setForceSelectionMode: (isForced: boolean) => void;
}

/**
 * COMPOSABLE: useSelectionStore
 *
 * @remarks
 * A domain-blind utility for managing a set of selected item identifiers.
 * Facilitates multi-selection modes and batch processing workflows.
 *
 * Satisfies CleanStack Architecture ADR Section I (Core Services Foundation)
 * and ADR Section III (Data Flow & Presentation Orchestration).
 * Provides a centralized, reactive state for batch selection that is decoupled
 * from feature-specific logic, enabling standardized interaction patterns
 * across the Roster and Headhunter features.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core Service (@core/services)
 * - **Role:** Pure state management for item selection.
 * - **Import Boundaries:** May import from Layer 1 (@core) and Layer 0 (@substrate).
 *   Imports from Shared (@shared), Features (@features), or App (@app) are forbidden.
 *
 * **Side Effects:**
 * - None. All state resides purely in-memory and is not persisted to storage.
 *
 * @returns Reactive state and handlers adhering to `UseSelectionStoreReturn`.
 */
export function useSelectionStore(): UseSelectionStoreReturn {
  /** Reactive array of selected item identifiers. */
  const selectedIds = ref<string[]>([]);

  /**
   * Internal flag to force the selection UI active even if zero items are selected.
   * [DECISION LOG] This allows the UI to enter a "preparation" phase for selection
   * before the first item is actually clicked.
   */
  const isManualSelectionModeForced = ref(false);

  /**
   * Indicates if the UI should be in selection mode.
   *
   * @remarks
   * [THREAT:] Logic Desync.
   * [DECISION LOG] Authoritative Selection State: Selection mode is derived from
   * either active selections or a manual override. This ensures the FAB and
   * SelectionBar remain perfectly synchronized with the underlying data.
   */
  const isSelectionMode = computed(
    () => selectedIds.value.length > 0 || isManualSelectionModeForced.value,
  );

  /**
   * Toggles the selection status of an item.
   *
   * @remarks
   * [THREAT:] Duplicate Identifiers.
   * [DECISION LOG] Item existence is checked via `indexOf` before mutation to
   * prevent duplicate entries in the selection set, which would cause inaccurate
   * batch processing counts.
   *
   * @param targetItemId - The unique item identifier.
   */
  function toggleSelect(targetItemId: string): void {
    const existingIndex = selectedIds.value.indexOf(targetItemId);
    if (existingIndex !== -1) {
      selectedIds.value.splice(existingIndex, 1);
    } else {
      selectedIds.value.push(targetItemId);
    }
  }

  /**
   * Replaces the current selection with a new set of IDs.
   *
   * @remarks
   * [DECISION LOG] Immutability: The selection array is replaced via spreading
   * to ensure Vue's reactivity system detects the change across all observers.
   *
   * @param targetItemIds - The new set of identifiers.
   */
  function selectAll(targetItemIds: readonly string[]): void {
    selectedIds.value = [...targetItemIds];
  }

  /**
   * Clears all selections and resets the selection mode.
   *
   * @remarks
   * [DECISION LOG] Total Reset: Both the identifiers and the manual override
   * are cleared to ensure a clean exit from selection-oriented UI states.
   */
  function clearSelection(): void {
    selectedIds.value = [];
    isManualSelectionModeForced.value = false;
  }

  /**
   * Manually overrides the selection mode state.
   *
   * @param isForced - Whether to force selection mode active.
   */
  function setForceSelectionMode(isForced: boolean): void {
    isManualSelectionModeForced.value = isForced;
  }

  return {
    selectedIds,
    isSelectionMode,
    toggleSelect,
    selectAll,
    clearSelection,
    setForceSelectionMode,
  };
}
