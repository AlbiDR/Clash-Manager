import { ref, computed, type Ref, type ComputedRef } from "vue";

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
    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase();
      const cache = searchCache.value;
      result = (items.value || []).filter((item) => {
        if (typeof item === "object" && item !== null) {
          const normalizedFields = cache.get(item);
          return normalizedFields?.some((f) => f.includes(query));
        }
        // Fallback for primitives
        return searchFields(item).some((f) =>
          f.toLowerCase().includes(query),
        );
      });
    } else {
      result = [...(items.value || [])];
    }

    // 2. Sorting
    const comparator = sortStrategies[sortBy.value];
    if (comparator) {
      result.sort(comparator);
    }

    return result;
  });

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
