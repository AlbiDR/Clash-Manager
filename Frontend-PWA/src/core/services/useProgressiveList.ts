import { ref, watch, type Ref } from "vue";

/**
 * ⚡ USE PROGRESSIVE LIST
 * Optimization #44: Renders long lists in time-sliced chunks to maintain 60FPS.
 * Bug #17: Prevents jarring resets during background data refreshes.
 */
export function useProgressiveList<T>(
  sourceList: Ref<readonly T[]>,
  initialSize: number = 12,
) {
  const visibleItems = ref<T[]>([]) as Ref<T[]>;
  let currentChunkTimer: number | null = null;

  watch(
    sourceList,
    (newList, oldList) => {
      // 🛡️ Logic: Prevent churn (Bug #17)
      const isRefresh = oldList && oldList.length > 0 && Math.abs(newList.length - oldList.length) < 5;
      
      if (isRefresh && visibleItems.value.length >= initialSize) {
        visibleItems.value = newList.slice(0, visibleItems.value.length) as T[];
        if (visibleItems.value.length < newList.length) {
          scheduleChunk(newList as T[], visibleItems.value.length);
        }
        return;
      }

      // Fresh load or major change
      if (currentChunkTimer !== null) {
        if (window.cancelIdleCallback) window.cancelIdleCallback(currentChunkTimer);
        else cancelAnimationFrame(currentChunkTimer);
      }

      visibleItems.value = newList.slice(0, initialSize) as T[];
      if (newList.length > initialSize) {
        scheduleChunk(newList as T[], initialSize);
      }
    },
    { immediate: true },
  );

  function scheduleChunk(all: T[], currentCount: number) {
    const scheduler = window.requestIdleCallback || window.requestAnimationFrame;

    currentChunkTimer = scheduler(() => {
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


