import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref, nextTick } from "vue";
import { useProgressiveList } from "../useProgressiveList";

describe("useProgressiveList", () => {
  beforeEach(() => {
    vi.useFakeTimers();

    // Mock requestIdleCallback and cancelIdleCallback
    if (typeof window !== "undefined") {
      (window as any).requestIdleCallback = vi.fn((cb) => setTimeout(cb, 1));
      (window as any).cancelIdleCallback = vi.fn((id) => clearTimeout(id));

      // Ensure requestAnimationFrame also uses setTimeout for consistent fake timer control
      (window as any).requestAnimationFrame = vi.fn((cb) => setTimeout(cb, 1));
      (window as any).cancelAnimationFrame = vi.fn((id) => clearTimeout(id));
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders the initial chunk immediately", () => {
    const source = ref([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    const { visibleItems } = useProgressiveList(source, 5);

    expect(visibleItems.value).toHaveLength(5);
    expect(visibleItems.value).toEqual([1, 2, 3, 4, 5]);
  });

  it("progressively adds items in chunks", async () => {
    const source = ref(Array.from({ length: 30 }, (_, i) => i + 1));
    const { visibleItems } = useProgressiveList(source, 10);

    expect(visibleItems.value).toHaveLength(10);

    // First chunk (size 10 since length <= 100)
    vi.advanceTimersByTime(1);
    expect(visibleItems.value).toHaveLength(20);

    // Second chunk
    vi.advanceTimersByTime(1);
    expect(visibleItems.value).toHaveLength(30);
    expect(visibleItems.value[29]).toBe(30);
  });

  it("uses larger chunks for long lists (> 100 items)", async () => {
    const source = ref(Array.from({ length: 150 }, (_, i) => i + 1));
    const { visibleItems } = useProgressiveList(source, 10);

    expect(visibleItems.value).toHaveLength(10);

    // First chunk (size 20 since length > 100)
    vi.advanceTimersByTime(1);
    expect(visibleItems.value).toHaveLength(30);

    vi.advanceTimersByTime(1);
    expect(visibleItems.value).toHaveLength(50);
  });

  it("prevents churn on small refreshes (Bug #17)", async () => {
    const source = ref(Array.from({ length: 20 }, (_, i) => i + 1));
    const { visibleItems } = useProgressiveList(source, 10);

    // Load all items
    vi.advanceTimersByTime(2);
    expect(visibleItems.value).toHaveLength(20);

    // Update source with a small change (length difference < 5)
    source.value = Array.from({ length: 22 }, (_, i) => i + 1);
    await nextTick();

    // Should NOT reset to 10, but keep current length (20) and schedule the rest
    expect(visibleItems.value).toHaveLength(20);

    vi.advanceTimersByTime(1);
    expect(visibleItems.value).toHaveLength(22);
  });

  it("resets on major source list changes", async () => {
    const source = ref(Array.from({ length: 50 }, (_, i) => i + 1));
    const { visibleItems } = useProgressiveList(source, 10);

    // Load some items
    vi.advanceTimersByTime(1);
    expect(visibleItems.value).toHaveLength(20);

    // Major change (length difference >= 5)
    source.value = Array.from({ length: 10 }, (_, i) => i + 100);
    await nextTick();

    // Should reset to initialSize (10)
    expect(visibleItems.value).toHaveLength(10);
    expect(visibleItems.value[0]).toBe(100);
  });

  it("cancels pending timers when source changes", async () => {
    const source = ref(Array.from({ length: 50 }, (_, i) => i + 1));
    // Trigger initialization
    useProgressiveList(source, 10);

    const scheduler = window.requestIdleCallback || window.requestAnimationFrame;
    expect(scheduler).toHaveBeenCalled();

    // Trigger change
    source.value = Array.from({ length: 5 }, (_, i) => i + 1);
    await nextTick();

    const canceller = window.cancelIdleCallback || window.cancelAnimationFrame;
    expect(canceller).toHaveBeenCalled();
  });
});
