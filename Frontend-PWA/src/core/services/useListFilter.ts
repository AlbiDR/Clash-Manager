import { ref, computed, type Ref, type ComputedRef } from "vue";

/**
 * COMPOSABLE: useListFilter
 *
 * @remarks
 * A generic engine for filtering and sorting arrays of items. It implements
 * an optimized search pattern using a `WeakMap` to cache normalized search
 * strings, achieving O(N) lookup performance during active filtering by
 * decoupling normalization from the filter predicate.
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
 * None. This composable manages internal reactive state only.
 */
// PERFORMANCE: Cache normalized search strings to avoid O(N * F) work on every keystroke.
// We use a persistent WeakMap to enable O(1) amortized normalization per item.
// [PERF] MODULE SCOPE: Shared across instances (Roster/Headhunter) to avoid re-indexing.
const searchCache = new WeakMap<object, string[]>();

export function useListFilter<T extends { id: string; n?: string }>(
  items: Ref<readonly T[]> | ComputedRef<readonly T[]>,
  searchFields: (item: T) => string[],
  sortStrategies: Record<string, (a: T, b: T) => number>,
  defaultSort: string = "score",
) {
  const searchQuery = ref("");
  const sortBy = ref(defaultSort);

  const filteredItems = computed(() => {
    let result: T[];

    // 1. Search Filter (Optimized O(N) lookup)
    // Intent: Use a persistent cache to avoid redundant string normalization
    // during the filter pass, ensuring 60FPS even with large lists.
    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase();
      result = (items.value || []).filter((item) => {
        if (typeof item === "object" && item !== null) {
          let normalizedFields = searchCache.get(item);
          if (!normalizedFields) {
            normalizedFields = searchFields(item).map((field) => field.toLowerCase());
            searchCache.set(item, normalizedFields);
          }
          return normalizedFields?.some((field) => field.includes(query));
        }
        // Fallback for primitives or non-object types
        return searchFields(item).some((field) =>
          field.toLowerCase().includes(query),
        );
      });
    } else {
      result = [...(items.value || [])];
    }

    // 2. Sorting
    // Intent: Apply the user-selected strategy. Note: stability depends on the strategy.
    const comparator = sortStrategies[sortBy.value];
    if (comparator) {
      result.sort((a, b) => {
        const res = comparator(a, b);
        if (res !== 0) return res;
        // 🛡️ Tie-breaker: Ensure stable sorting by Name, then ID
        // Target B [2]: Removed 'any' pathogens by enforcing T extends { id, n }.
        const nameA = a.n || "";
        const nameB = b.n || "";
        const nameRes = nameA.localeCompare(nameB);
        if (nameRes !== 0) return nameRes;
        return a.id.localeCompare(b.id);
      });
    }

    return result;
  });

  /**
   * Updates the active sorting strategy.
   *
   * @remarks
   * Employs the `document.startViewTransition` API when available to provide
   * smooth layout animations as list items re-order.
   *
   * @param val - The key of the sorting strategy to apply.
   */
  function updateSort(val: string) {
    if (document.startViewTransition) {
      document.startViewTransition(() => {
        sortBy.value = val;
      });
    } else {
      sortBy.value = val;
    }
  }

  return {
    searchQuery,
    sortBy,
    filteredItems,
    updateSort,
  };
}
