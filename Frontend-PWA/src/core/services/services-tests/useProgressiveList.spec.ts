import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref, nextTick, effectScope } from "vue";
import { useProgressiveList } from "../useProgressiveList";

describe("useProgressiveList", () => {
  beforeEach(() => {
    vi.useFakeTimers();

    // Mock requestIdleCallback and cancelIdleCallback
    if (typeof window !== "undefined") {
      (window as any).requestIdleCallback = vi.fn((cb) => setTimeout(() => cb({
        timeRemaining: () => 0, // Default to 0 to prevent do-while loop from running multiple times
        didTimeout: false
      }), 1));
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
    const scope = effectScope();
    scope.run(() => {
      const source = ref([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
      const { visibleItems } = useProgressiveList(source, 5);

      expect(visibleItems.value).toHaveLength(5);
      expect(visibleItems.value).toEqual([1, 2, 3, 4, 5]);
    });
    scope.stop();
  });

  it("progressively adds items in chunks", async () => {
    const scope = effectScope();
    await scope.run(async () => {
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
    scope.stop();
  });

  it("uses larger chunks for long lists (> 100 items)", async () => {
    const scope = effectScope();
    await scope.run(async () => {
      const source = ref(Array.from({ length: 150 }, (_, i) => i + 1));
      const { visibleItems } = useProgressiveList(source, 10);

      expect(visibleItems.value).toHaveLength(10);

      // First chunk (size 20 since length > 100)
      vi.advanceTimersByTime(1);
      expect(visibleItems.value).toHaveLength(30);

      vi.advanceTimersByTime(1);
      expect(visibleItems.value).toHaveLength(50);
    });
    scope.stop();
  });

  it("prevents churn on small refreshes (Bug #17)", async () => {
    const scope = effectScope();
    await scope.run(async () => {
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
    scope.stop();
  });

  it("resets on major source list changes", async () => {
    const scope = effectScope();
    await scope.run(async () => {
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
    scope.stop();
  });

  it("cancels pending timers when source changes", async () => {
    const scope = effectScope();
    await scope.run(async () => {
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
    scope.stop();
  });

  it("implements idle budgeting (Optimization #44)", async () => {
    const scope = effectScope();
    await scope.run(async () => {
      // Setup requestIdleCallback to allow multiple chunks
      let calls = 0;
      (window as any).requestIdleCallback = vi.fn((cb) => {
        setTimeout(() => cb({
          // First 2 calls to timeRemaining return 10ms (enough for more chunks), then 0ms
          timeRemaining: () => {
            calls++;
            return calls <= 2 ? 10 : 0;
          },
          didTimeout: false
        }), 1);
      });

      const source = ref(Array.from({ length: 100 }, (_, i) => i + 1));
      const { visibleItems } = useProgressiveList(source, 10);

      expect(visibleItems.value).toHaveLength(10);

      // In one frame, it should process multiple chunks if time remains
      vi.advanceTimersByTime(1);

      // Chunk size is 10 for length <= 100.
      // Loop:
      // 1. chunk 1: 10 + 10 = 20. timeRemaining (1) -> 10 > 1. continue.
      // 2. chunk 2: 20 + 10 = 30. timeRemaining (2) -> 10 > 1. continue.
      // 3. chunk 3: 30 + 10 = 40. timeRemaining (3) -> 0 <= 1. BREAK.
      // Result: 40.
      expect(visibleItems.value).toHaveLength(40);
    });
    scope.stop();
  });

  it("falls back to requestAnimationFrame when requestIdleCallback is unavailable", async () => {
    const scope = effectScope();
    await scope.run(async () => {
      const originalRIC = (window as any).requestIdleCallback;
      (window as any).requestIdleCallback = undefined;

      const source = ref(Array.from({ length: 30 }, (_, i) => i + 1));
      const { visibleItems } = useProgressiveList(source, 10);

      expect(visibleItems.value).toHaveLength(10);
      expect(window.requestAnimationFrame).toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(visibleItems.value).toHaveLength(20);

      (window as any).requestIdleCallback = originalRIC;
    });
    scope.stop();
  });

  it("cleans up timers via onScopeDispose", () => {
    const scope = effectScope();
    let cancelCalled = false;
    const originalCancel = (window as any).cancelIdleCallback;
    (window as any).cancelIdleCallback = vi.fn(() => {
      cancelCalled = true;
    });

    scope.run(() => {
      const source = ref(Array.from({ length: 50 }, (_, i) => i + 1));
      useProgressiveList(source, 10);
    });

    scope.stop();
    expect(cancelCalled).toBe(true);
    (window as any).cancelIdleCallback = originalCancel;
  });
});
