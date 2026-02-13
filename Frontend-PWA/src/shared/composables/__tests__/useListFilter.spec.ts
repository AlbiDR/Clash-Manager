import { useListFilter } from "./useListFilter";
import { describe, it, expect } from "vitest";
import { ref } from "vue";
describe("useListFilter", () => {
  const mockItems = [
    { id: "p1", n: "Albi", score: 100 },
    { id: "p2", n: "Zoro", score: 80 },
    { id: "p3", n: "Bobi", score: 90 },
  ];

  const searchFields = (item: typeof mockItems[0]) => [item.n, item.id];
  const sortStrategies = {
    score: (a: any, b: any) => b.score - a.score,
    name: (a: any, b: any) => a.n.localeCompare(b.n),
  };

  it("filters items by search query", () => {
    const items = ref(mockItems);
    const { searchQuery, filteredItems } = useListFilter(
      items,
      searchFields,
      sortStrategies,
      "score"
    );

    searchQuery.value = "albi";
    expect(filteredItems.value).toHaveLength(1);
    expect(filteredItems.value[0].id).toBe("p1");

    searchQuery.value = "p3";
    expect(filteredItems.value).toHaveLength(1);
    expect(filteredItems.value[0].id).toBe("p3");
  });

  it("sorts items using the selected strategy", () => {
    const items = ref(mockItems);
    const { sortBy, filteredItems } = useListFilter(
      items,
      searchFields,
      sortStrategies,
      "score"
    );

    // Default sort: score (desc)
    expect(filteredItems.value[0].id).toBe("p1"); // 100
    expect(filteredItems.value[1].id).toBe("p3"); // 90
    expect(filteredItems.value[2].id).toBe("p2"); // 80

    sortBy.value = "name";
    expect(filteredItems.value[0].id).toBe("p1"); // Albi
    expect(filteredItems.value[1].id).toBe("p3"); // Bobi
    expect(filteredItems.value[2].id).toBe("p2"); // Zoro
  });

  it("updates when the source list changes", () => {
    const items = ref(mockItems);
    const { filteredItems } = useListFilter(
      items,
      searchFields,
      sortStrategies,
      "score"
    );

    expect(filteredItems.value).toHaveLength(3);

    items.value = [...mockItems, { id: "p4", n: "New", score: 110 }];
    expect(filteredItems.value).toHaveLength(4);
    expect(filteredItems.value[0].id).toBe("p4");
  });

  it("handles case-insensitive search", () => {
    const items = ref(mockItems);
    const { searchQuery, filteredItems } = useListFilter(
      items,
      searchFields,
      sortStrategies,
      "score"
    );

    searchQuery.value = "ALBI";
    expect(filteredItems.value).toHaveLength(1);
    expect(filteredItems.value[0].id).toBe("p1");
  });

  it("should handle deterministic sorting on ties (n then id)", () => {
    // The implementation includes a tie-breaker that sorts by name, then by id
    // when the primary comparator returns 0 (tie).
    const tieItems = [
      { id: "p2", n: "Zoro", score: 100 },
      { id: "p1", n: "Albi", score: 100 },
      { id: "p3", n: "Albi", score: 100 },
    ];
    const items = ref(tieItems);
    const { filteredItems } = useListFilter(
      items,
      searchFields,
      sortStrategies,
      "score"
    );

    // With tie-breaker (name then id):
    // 1. All have score: 100 (tie on primary sort)
    // 2. Sort by name: "Albi" < "Zoro"
    //    - p1 (Albi) comes before p2 (Zoro)
    //    - p3 (Albi) comes before p2 (Zoro)
    // 3. Among "Albi" items, sort by id: "p1" < "p3"
    // Expected order: [p1, p3, p2]
    expect(filteredItems.value[0].id).toBe("p1");
    expect(filteredItems.value[1].id).toBe("p3");
    expect(filteredItems.value[2].id).toBe("p2");
  });
});