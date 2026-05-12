import { useListFilter } from "../useListFilter";
import { describe, it, expect, vi, afterEach } from "vitest";
import { ref } from "vue";

describe("useListFilter", () => {
  const mockItems = [
    { id: "p1", n: "Albi", score: 100 },
    { id: "p2", n: "Zoro", score: 80 },
    { id: "p3", n: "Bobi", score: 90 },
  ];

  const searchFields = (item: typeof mockItems[0]) => [item.n || "", item.id];
  const sortStrategies = {
    score: (a: any, b: any) => b.score - a.score,
    name: (a: any, b: any) => (a.n || "").localeCompare(b.n || ""),
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

    expect(filteredItems.value[0].id).toBe("p1");
    expect(filteredItems.value[1].id).toBe("p3");
    expect(filteredItems.value[2].id).toBe("p2");
  });

  // --- NEW EDGE CASES ---

  it("handles null or undefined items gracefully", () => {
    const items = ref<any[] | null>(null);
    const { filteredItems } = useListFilter(
      items as any,
      (item: any) => [item.id],
      {},
      "score"
    );

    expect(filteredItems.value).toEqual([]);

    items.value = undefined as any;
    expect(filteredItems.value).toEqual([]);
  });

  it("handles missing 'n' property during tie-breaker", () => {
    const tieItems = [
      { id: "p2", score: 100 }, // Missing 'n'
      { id: "p1", n: "Albi", score: 100 },
      { id: "p3", score: 100 }, // Missing 'n'
    ];
    const items = ref(tieItems as any);
    const { filteredItems } = useListFilter(
      items,
      (item: any) => [item.id],
      { score: (a: any, b: any) => b.score - a.score },
      "score"
    );

    // Tie-breaker logic:
    // nameA = a.n || "";
    // nameB = b.n || "";
    // nameRes = nameA.localeCompare(nameB);
    // If nameRes === 0, return a.id.localeCompare(b.id);

    // p1 (Albi) vs p2 ("") -> "Albi".localeCompare("") > 0 -> p2 before p1
    // p2 ("") vs p3 ("") -> 0 -> p2.id ("p2") vs p3.id ("p3") -> "p2" < "p3" -> p2 before p3
    // p1 ("Albi") vs p3 ("") -> > 0 -> p3 before p1

    // So order should be p2, p3, p1
    expect(filteredItems.value[0].id).toBe("p2");
    expect(filteredItems.value[1].id).toBe("p3");
    expect(filteredItems.value[2].id).toBe("p1");
  });

  it("returns original order when an invalid sort strategy is used", () => {
    const items = ref(mockItems);
    const { filteredItems, sortBy } = useListFilter(
      items,
      searchFields,
      sortStrategies,
      "invalid"
    );

    expect(filteredItems.value[0].id).toBe("p1");
    expect(filteredItems.value[1].id).toBe("p2");
    expect(filteredItems.value[2].id).toBe("p3");
  });

  describe("updateSort", () => {
    const originalStartViewTransition = document.startViewTransition;

    afterEach(() => {
      (document as any).startViewTransition = originalStartViewTransition;
    });

    it("updates sortBy immediately if startViewTransition is not available", () => {
      const items = ref(mockItems);
      const { sortBy, updateSort } = useListFilter(
        items,
        searchFields,
        sortStrategies,
        "score"
      );

      (document as any).startViewTransition = undefined;

      updateSort("name");
      expect(sortBy.value).toBe("name");
    });

    it("uses startViewTransition when available", () => {
      const items = ref(mockItems);
      const { sortBy, updateSort } = useListFilter(
        items,
        searchFields,
        sortStrategies,
        "score"
      );

      const mockTransition = {
        finished: Promise.resolve(),
        ready: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
      };
      const startViewTransition = vi.fn((cb: any) => {
        cb();
        return mockTransition;
      });
      (document as any).startViewTransition = startViewTransition;

      updateSort("name");

      expect(startViewTransition).toHaveBeenCalled();
      expect(sortBy.value).toBe("name");
    });
  });
});
