import { ref, watch, type Ref } from "vue";

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
 * It also includes "Churn Prevention" logic (Bug #17) to ensure that background
 * data refreshes (e.g., small score updates) do not trigger a full list reset,
 * which would be jarring for the user.
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
   */
  const visibleItems = ref<T[]>([]) as Ref<T[]>;

  /**
   * SIDE EFFECTS
   * Manages scheduling and cancellation of frame-based chunk injections.
   */
  let currentChunkTimer: number | null = null;

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
      if (currentChunkTimer !== null) {
        if (window.cancelIdleCallback)
          window.cancelIdleCallback(currentChunkTimer);
        else cancelAnimationFrame(currentChunkTimer);
      }

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

    currentChunkTimer = scheduler(() => {
      // Decision: Chunk Size Scaling
      // For extremely long lists (>100), we increase chunk size to 20 to speed up
      // total hydration time. For smaller lists, 10 items per frame is the
      // "Golden Ratio" for maintaining smooth scrolling during injection.
      const chunkSize = all.length > 100 ? 20 : 10;
      const nextCount = Math.min(currentCount + chunkSize, all.length);

      visibleItems.value = all.slice(0, nextCount);

      if (nextCount < all.length) {
        scheduleChunk(all, nextCount);
      }
    }) as unknown as number;
  }

  return {
    visibleItems,
  };
}
