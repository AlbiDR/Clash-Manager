import { ref, watch, type Ref, shallowRef, onScopeDispose } from "vue";

/**
 * COMPOSABLE: useProgressiveList
 *
 * @remarks
 * Optimization #44: Progressive Rendering Engine.
 * This service implements a time-sliced rendering strategy to maintain 60FPS when
 * handling large datasets. Instead of overwhelming the DOM with hundreds of
 * items at once, it breaks the list into manageable chunks and schedules their
 * injection during idle browser frames.
 *
 * [PERF] Optimized for v13.4:
 * - Uses shallowRef to reduce reactive overhead of the visible list.
 * - Utilizes IdleDeadline to process multiple chunks per idle frame.
 * - Implements automated cleanup via onScopeDispose.
 *
 * @param sourceList - The full reactive list of items to be rendered.
 * @param initialSize - The number of items to render immediately on first load.
 *
 * @returns
 * - `visibleItems`: A reactive slice of the source list that grows over time.
 */
export function useProgressiveList<T>(
  sourceList: Ref<readonly T[]>,
  initialSize: number = 12,
) {
  /**
   * REACTIVE STATE
   * [PERF] shallowRef: Prevents deep reactivity on large arrays,
   * significantly reducing CPU cycles during list expansion.
   */
  const visibleItems = shallowRef<T[]>([]) as Ref<T[]>;

  /**
   * SIDE EFFECTS
   * Manages scheduling and cancellation of frame-based chunk injections.
   */
  let currentChunkTimer: number | null = null;

  function clearTimer() {
    if (currentChunkTimer !== null) {
      if (window.cancelIdleCallback) {
        window.cancelIdleCallback(currentChunkTimer);
      } else {
        cancelAnimationFrame(currentChunkTimer);
      }
      currentChunkTimer = null;
    }
  }

  // [CLEANUP] Automated disposal of timers on scope unmount
  onScopeDispose(clearTimer);

  watch(
    sourceList,
    (newList, oldList) => {
      // Logic: Churn Prevention (Bug #17)
      // A "Refresh" is defined as a minor change in list size (< 5 items).
      // We assume these are score updates or single member changes.
      // In this case, we update existing visible items without resetting the view.
      const isRefresh =
        oldList &&
        oldList.length > 0 &&
        Math.abs(newList.length - oldList.length) < 5;

      if (isRefresh && visibleItems.value.length >= initialSize) {
        visibleItems.value = newList.slice(0, visibleItems.value.length) as T[];
        if (visibleItems.value.length < newList.length) {
          scheduleChunk(newList as T[], visibleItems.value.length);
        }
        return;
      }

      // Fresh load or major structural change (e.g., filter applied)
      // We cancel any pending chunk injections to prevent race conditions.
      clearTimer();

      // Initial render for immediate perceived performance
      visibleItems.value = newList.slice(0, initialSize) as T[];
      if (newList.length > initialSize) {
        scheduleChunk(newList as T[], initialSize);
      }
    },
    { immediate: true },
  );

  /**
   * Schedules the next batch of items for injection.
   *
   * @remarks
   * Utilizes requestIdleCallback where available to minimize impact on
   * user interaction threads. Falls back to requestAnimationFrame.
   */
  function scheduleChunk(all: T[], currentCount: number) {
    const scheduler =
      window.requestIdleCallback || window.requestAnimationFrame;

    currentChunkTimer = (scheduler as any)((deadline?: any) => {
      let nextCount = currentCount;

      // [PERF] IDLE BUDGETING: If we have an idle deadline, we attempt to
      // process as many chunks as possible within the remaining time.
      // [FIX] SAFETY CHECK: requestAnimationFrame passes a DOMHighResTimeStamp,
      // not an IdleDeadline. We must verify 'timeRemaining' exists before calling.
      const hasIdleDeadline = deadline && typeof deadline.timeRemaining === "function";

      do {
        const chunkSize = all.length > 100 ? 20 : 10;
        nextCount = Math.min(nextCount + chunkSize, all.length);

        // Break early if we've reached the end of the list
        if (nextCount >= all.length) break;

      } while (hasIdleDeadline && deadline.timeRemaining() > 1 && !deadline.didTimeout);

      visibleItems.value = all.slice(0, nextCount);

      if (nextCount < all.length) {
        scheduleChunk(all, nextCount);
      } else {
        currentChunkTimer = null;
      }
    }) as unknown as number;
  }

  return {
    visibleItems,
  };
}
