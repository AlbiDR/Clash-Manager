import { ref, onMounted, onUnmounted } from "vue";
import { useHaptics } from "./useHaptics";

/**
 * 🔄 USE PULL TO REFRESH
 * Optimization #40: Native-like pull-to-refresh mechanism with haptic feedback.
 */
export function usePullToRefresh(onRefresh: () => Promise<void>) {
  const pullDistance = ref(0);
  const isRefreshing = ref(false);
  const haptics = useHaptics();

  let startY = 0;
  const THRESHOLD = 80;
  const MAX_PULL = 120;

  const handleStart = (e: TouchEvent) => {
    if (window.scrollY > 0 || isRefreshing.value) return;
    startY = e.touches[0].clientY;
  };

  const handleMove = (e: TouchEvent) => {
    if (window.scrollY > 0 || isRefreshing.value) {
        pullDistance.value = 0;
        return;
    }

    const currentY = e.touches[0].clientY;
    const diff = currentY - startY;

    if (diff > 0) {
      // Resistance logic: it gets harder to pull the further you go
      const dampenedDiff = Math.pow(diff, 0.85);
      pullDistance.value = Math.min(dampenedDiff, MAX_PULL);

      // Trigger haptic when crossing threshold
      if (pullDistance.value >= THRESHOLD && pullDistance.value < THRESHOLD + 2) {
        haptics.tap();
      }
      
      // Prevent scrolling while pulling
      if (e.cancelable) e.preventDefault();
    }
  };

  const handleEnd = async () => {
    if (isRefreshing.value) return;

    if (pullDistance.value >= THRESHOLD) {
      isRefreshing.value = true;
      pullDistance.value = THRESHOLD;
      haptics.sync();
      
      try {
        await onRefresh();
        haptics.success();
      } catch (e) {
        haptics.error();
      } finally {
        isRefreshing.value = false;
        pullDistance.value = 0;
      }
    } else {
      pullDistance.value = 0;
    }
  };

  onMounted(() => {
    window.addEventListener("touchstart", handleStart, { passive: true });
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleEnd);
  });

  onUnmounted(() => {
    window.removeEventListener("touchstart", handleStart);
    window.removeEventListener("touchmove", handleMove);
    window.removeEventListener("touchend", handleEnd);
  });

  return {
    pullDistance,
    isRefreshing,
  };
}
