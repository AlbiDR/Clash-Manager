// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { ref, computed, watch, type Ref, type ComputedRef } from "vue";

/**
 * COMPOSABLE: useListFilter
 *
 * @remarks
 * A generic engine for filtering and sorting arrays of items. It implements
 * an optimized search pattern using a `WeakMap` to cache normalized search
 * strings, achieving O(N) lookup performance during active filtering by
 * decoupling normalization from the filter predicate.
 *
 * Satisfies ADR Section I (Core Services) and ADR Section II (Presentation Orchestration).
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 (@core)
 * - **Performance:** Employs a module-level `WeakMap` for amortized O(1) normalization.
 *
 * @param items - Reactive reference to the source array.
 * @param searchFields - Function to extract searchable strings from an item.
 * @param sortStrategies - Dictionary of comparator functions.
 * @param defaultSort - The initial sorting strategy key (defaults to "score").
 *
 * @returns
 * - `searchQuery`: Reactive string for the current search filter.
 * - `sortBy`: Reactive string indicating the active sort strategy.
 * - `filteredItems`: Computed array of filtered and sorted results.
 * - `updateSort`: Method to change the sorting strategy with View Transition support.
 *
 * @sideeffects
 * Optionally reads and writes the selected sort key to localStorage when
 * `sortStorageKey` is provided.
 */

// PERFORMANCE: Cache normalized search strings to avoid O(N * F) work on every keystroke.
// We use a persistent WeakMap to enable O(1) amortized normalization per item.
// [PERF] MODULE SCOPE: Shared across instances (Roster/Headhunter) to avoid re-indexing.
// [THREAT:] Memory exhaustion in long-lived sessions if using a standard Map.
// [DECISION LOG] WeakMap is used to allow the garbage collector to reclaim
// item-specific cache entries once the source item is no longer referenced.
const searchCache = new WeakMap<object, { fields: string[]; normalized: string[] }>();

/**
 * Orchestrates filtering and sorting logic for list-based datasets.
 *
 * @template T - The item type, which must include at least an `id` and optional `n` (name).
 */
export function useListFilter<T extends { id: string; n?: string }>(
  items: Ref<readonly T[]> | ComputedRef<readonly T[]>,
  searchFields: (candidateItem: T) => string[],
  sortStrategies: Record<string, (itemA: T, itemB: T) => number>,
  defaultSort: string = "score",
  sortStorageKey?: string,
) {
  const searchQuery = ref("");
  const sortBy = ref(resolveInitialSort(sortStrategies, defaultSort, sortStorageKey));

  if (sortStorageKey) {
    watch(sortBy, (nextSortKey) => {
      try {
        if (sortStrategies[nextSortKey]) {
          localStorage.setItem(sortStorageKey, nextSortKey);
        }
      } catch (sortPersistenceError) {
        console.warn("[ListFilter] Sort preference persistence failed", sortPersistenceError);
      }
    });
  }

  const filteredItems = computed(() => {
    let filteredPool: T[];

    // 1. Search Filter (Optimized O(N) lookup)
    // Intent: Use a persistent cache to avoid redundant string normalization
    // during the filter pass, ensuring 60FPS even with large lists.
    if (searchQuery.value) {
      const searchCriteria = searchQuery.value.toLowerCase();
      filteredPool = (items.value || []).filter((candidateItem) => {
        if (typeof candidateItem === "object" && candidateItem !== null) {
          const currentFields = searchFields(candidateItem);
          const cachedSearch = searchCache.get(candidateItem);
          const normalizedFields =
            cachedSearch && areSearchFieldsEqual(cachedSearch.fields, currentFields)
              ? cachedSearch.normalized
              : currentFields.map((field) => field.toLowerCase());
          if (!cachedSearch || cachedSearch.normalized !== normalizedFields) {
            searchCache.set(candidateItem, { fields: [...currentFields], normalized: normalizedFields });
          }
          return normalizedFields?.some((field) => field.includes(searchCriteria));
        }
        // Fallback for primitives or non-object types
        return searchFields(candidateItem).some((field) =>
          field.toLowerCase().includes(searchCriteria),
        );
      });
    } else {
      filteredPool = [...(items.value || [])];
    }

    // 2. Sorting
    // Intent: Apply the user-selected strategy. Note: stability depends on the strategy.
    const comparator = sortStrategies[sortBy.value];
    if (comparator) {
      filteredPool.sort((itemA, itemB) => {
        const comparisonResult = comparator(itemA, itemB);
        if (comparisonResult !== 0) return comparisonResult;
        // [GUARD] Tie-breaker: Ensure stable sorting by Name, then ID
        // Target B [2]: Removed 'any' pathogens by enforcing T extends { id, n }.
        const nameA = itemA.n || "";
        const nameB = itemB.n || "";
        const nameRes = nameA.localeCompare(nameB);
        if (nameRes !== 0) return nameRes;
        return itemA.id.localeCompare(itemB.id);
      });
    }

    return filteredPool;
  });

  /**
   * Updates the active sorting strategy.
   *
   * @remarks
   * Employs the `document.startViewTransition` API when available to provide
   * smooth layout animations as list items re-order.
   *
   * @param targetSortKey - The key of the sorting strategy to apply.
   */
  function updateSort(targetSortKey: string) {
    if (document.startViewTransition) {
      document.startViewTransition(() => {
        sortBy.value = targetSortKey;
      });
    } else {
      sortBy.value = targetSortKey;
    }
  }

  return {
    searchQuery,
    sortBy,
    filteredItems,
    updateSort,
  };
}

function resolveInitialSort(
  sortStrategies: Record<string, unknown>,
  defaultSort: string,
  sortStorageKey?: string,
): string {
  if (!sortStorageKey) return defaultSort;

  try {
    const storedSort = localStorage.getItem(sortStorageKey);
    if (storedSort && sortStrategies[storedSort]) return storedSort;
  } catch (sortHydrationError) {
    console.warn("[ListFilter] Sort preference hydration failed", sortHydrationError);
  }

  return defaultSort;
}

function areSearchFieldsEqual(leftFields: string[], rightFields: string[]): boolean {
  return leftFields.length === rightFields.length &&
    leftFields.every((field, fieldIndex) => field === rightFields[fieldIndex]);
}
