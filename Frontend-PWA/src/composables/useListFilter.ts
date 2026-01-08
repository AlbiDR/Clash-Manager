import { ref, computed, type Ref, type ComputedRef } from "vue";

export function useListFilter<T>(
  items: Ref<readonly T[]> | ComputedRef<readonly T[]>,
  searchFields: (item: T) => string[],
  sortStrategies: Record<string, (a: T, b: T) => number>,
  defaultSort: string = "score",
) {
  const searchQuery = ref("");
  const sortBy = ref(defaultSort);

  const filteredItems = computed(() => {
    let result = [...(items.value || [])];

    // 1. Search Filter
    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase();
      result = result.filter((item) => {
        const fields = searchFields(item);
        return fields.some((f) => f.toLowerCase().includes(query));
      });
    }

    // 2. Sorting
    const comparator = sortStrategies[sortBy.value];
    if (comparator) {
      result.sort(comparator);
    }

    return result;
  });

  function updateSort(val: string) {
    if ((document as any).startViewTransition) {
      (document as any).startViewTransition(() => {
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
