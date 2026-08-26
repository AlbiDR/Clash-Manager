// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { useListFilter } from "../useListFilter";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { ref } from "vue";

describe("useListFilter", () => {
  const mockItems = [
    { id: "p1", n: "Albi", score: 100 },
    { id: "p2", n: "Zoro", score: 80 },
    { id: "p3", n: "Bobi", score: 90 },
  ];

  const searchFields = (candidateItem: typeof mockItems[0]) => [candidateItem.n || "", candidateItem.id];
  const sortStrategies = {
    score: (a: any, b: any) => b.score - a.score,
    name: (a: any, b: any) => (a.n || "").localeCompare(b.n || ""),
  };

  beforeEach(() => {
    localStorage.clear();
  });

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

  it("refreshes cached search text when an item object is mutated in place", () => {
    const mutableItem = { id: "p1", n: "Alice", score: 100 };
    const items = ref([mutableItem]);
    const { searchQuery, filteredItems } = useListFilter(
      items,
      searchFields,
      sortStrategies,
      "score"
    );

    searchQuery.value = "alice";
    expect(filteredItems.value).toHaveLength(1);

    mutableItem.n = "Bob";
    items.value = [mutableItem];
    searchQuery.value = "bob";
    expect(filteredItems.value).toHaveLength(1);
    expect(filteredItems.value[0].id).toBe("p1");
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
      (candidateItem: any) => [candidateItem.id],
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
      (candidateItem: any) => [candidateItem.id],
      { score: (a: any, b: any) => b.score - a.score },
      "score"
    );

    // Deterministic tie-breaker: normalized name first, then player id.
    expect(filteredItems.value[0].id).toBe("p2");
    expect(filteredItems.value[1].id).toBe("p3");
    expect(filteredItems.value[2].id).toBe("p1");
  });

  it("returns original order when an invalid sort strategy is used", () => {
    const items = ref(mockItems);
    const { filteredItems, sortBy: _sortBy } = useListFilter(
      items,
      searchFields,
      sortStrategies,
      "invalid"
    );

    expect(filteredItems.value[0].id).toBe("p1");
    expect(filteredItems.value[1].id).toBe("p2");
    expect(filteredItems.value[2].id).toBe("p3");
  });

  it("hydrates sortBy from localStorage when the stored strategy is valid", () => {
    localStorage.setItem("cm_test_sort", "name");
    const items = ref(mockItems);
    const { sortBy, filteredItems } = useListFilter(
      items,
      searchFields,
      sortStrategies,
      "score",
      "cm_test_sort"
    );

    expect(sortBy.value).toBe("name");
    expect(filteredItems.value.map((item) => item.id)).toEqual(["p1", "p3", "p2"]);
  });

  it("falls back to the default sort when localStorage contains an invalid strategy", () => {
    localStorage.setItem("cm_test_sort", "missing");
    const items = ref(mockItems);
    const { sortBy, filteredItems } = useListFilter(
      items,
      searchFields,
      sortStrategies,
      "score",
      "cm_test_sort"
    );

    expect(sortBy.value).toBe("score");
    expect(filteredItems.value.map((item) => item.id)).toEqual(["p1", "p3", "p2"]);
  });

  it("persists valid sort changes to localStorage", async () => {
    const items = ref(mockItems);
    const { updateSort } = useListFilter(
      items,
      searchFields,
      sortStrategies,
      "score",
      "cm_test_sort"
    );

    updateSort("name");

    await Promise.resolve();
    expect(localStorage.getItem("cm_test_sort")).toBe("name");
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

  it("handles primitive or non-object item candidates during filtering", () => {
    const primitiveItems = ["alpha", null, { id: "p1", n: "beta" }, 123];
    const items = ref(primitiveItems as any);
    const { searchQuery, filteredItems } = useListFilter(
      items,
      (candidateItem: any) => {
        if (typeof candidateItem === "string") return [candidateItem];
        if (candidateItem && candidateItem.n) return [candidateItem.n];
        return ["fallback"];
      },
      {},
      "score"
    );

    searchQuery.value = "bet";
    expect(filteredItems.value).toHaveLength(1);
    expect(filteredItems.value[0]).toEqual({ id: "p1", n: "beta" });

    searchQuery.value = "fall";
    expect(filteredItems.value).toHaveLength(2); // null and 123
  });

  it("re-evaluates search cache when searchFields returns different array values for the same object reference", () => {
    let dynamicField = "InitialValue";
    const itemRef = { id: "p1", n: "Test" };
    const items = ref([itemRef]);
    const { searchQuery, filteredItems } = useListFilter(
      items,
      () => [dynamicField],
      {},
      "score"
    );

    searchQuery.value = "initial";
    expect(filteredItems.value).toHaveLength(1);

    // Change extracted search fields dynamically without mutating the item object reference
    dynamicField = "UpdatedValue";
    searchQuery.value = "updated";
    expect(filteredItems.value).toHaveLength(1);
  });

  it("handles localStorage.getItem exceptions gracefully during hydration", () => {
    const getItemSpy = vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const items = ref(mockItems);
    const { sortBy } = useListFilter(
      items,
      searchFields,
      sortStrategies,
      "score",
      "cm_restricted_key"
    );

    expect(sortBy.value).toBe("score");
    expect(warnSpy).toHaveBeenCalledWith(
      "[ListFilter] Sort preference hydration failed",
      expect.any(Error)
    );

    getItemSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("handles localStorage.setItem exceptions gracefully during sort updates", async () => {
    const setItemSpy = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const items = ref(mockItems);
    const { updateSort } = useListFilter(
      items,
      searchFields,
      sortStrategies,
      "score",
      "cm_restricted_key"
    );

    updateSort("name");
    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalledWith(
      "[ListFilter] Sort preference persistence failed",
      expect.any(Error)
    );

    setItemSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
