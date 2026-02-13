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
 * CRACK: This composable currently lacks a deterministic tie-breaker in its
 * sorting logic. When primary sort values are equal, the order depends on the
 * underlying array's original stability, which can cause flickering in
 * virtualized lists or components using `v-memo`.
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
export function useListFilter<T>(
  items: Ref<readonly T[]> | ComputedRef<readonly T[]>,
  searchFields: (item: T) => string[],
  sortStrategies: Record<string, (a: T, b: T) => number>,
  defaultSort: string = "score",
) {
  const searchQuery = ref("");
  const sortBy = ref(defaultSort);

  // PERFORMANCE: Pre-calculate normalized search strings to avoid O(N * F) work on every keystroke.
  // We use a WeakMap to cache search strings for objects without forcing an 'id' constraint.
  const searchCache = computed(() => {
    const map = new WeakMap<object, string[]>();
    const list = items.value || [];
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (typeof item === "object" && item !== null) {
        map.set(
          item,
          searchFields(item).map((f) => f.toLowerCase()),
        );
      }
    }
    return map;
  });

  const filteredItems = computed(() => {
    let result: T[];

    // 1. Search Filter (Optimized O(N) lookup)
    // Intent: Use the pre-calculated cache to avoid redundant string normalization
    // during the filter pass, ensuring 60FPS even with large lists.
    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase();
      const cache = searchCache.value;
      result = (items.value || []).filter((item) => {
        if (typeof item === "object" && item !== null) {
          const normalizedFields = cache.get(item);
          return normalizedFields?.some((f) => f.includes(query));
        }
        // Fallback for primitives or non-object types
        return searchFields(item).some((f) =>
          f.toLowerCase().includes(query),
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
        const nameA = (a as any).n || "";
        const nameB = (b as any).n || "";
        const nameRes = nameA.localeCompare(nameB);
        if (nameRes !== 0) return nameRes;
        return ((a as any).id || "").localeCompare((b as any).id || "");
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
