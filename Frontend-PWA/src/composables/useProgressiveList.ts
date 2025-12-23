// @ts-nocheck
import { ref, watch, type Ref } from 'vue'

export function useProgressiveList<T>(
    sourceList: Ref<T[]>, 
    initialSize: number = 10
) {
    const visibleItems = ref<T[]>([])

    watch(sourceList, (newList) => {
        // 1. Immediate Render: Critical "Above the Fold" content only.
        // Slice gives us a new array reference, preventing reactivity leaks from the source.
        visibleItems.value = newList.slice(0, initialSize)

        // 2. Time-Sliced Hydration: Render the rest in small chunks to avoid TBT (Total Blocking Time).
        if (newList.length > initialSize) {
            scheduleChunk(newList, initialSize)
        }
    }, { immediate: true })

    function scheduleChunk(all: T[], currentCount: number) {
        // Futuristic: Use requestIdleCallback if available, fall back to RAF/Timeout
        const scheduler = (window as any).requestIdleCallback || requestAnimationFrame

        scheduler(() => {
            // Batch size: 10 items per tick. Small enough to fit in a frame (16ms).
            const nextCount = Math.min(currentCount + 10, all.length)
            
            // Update the view
            // Note: We use .slice() to ensure Vue detects the change efficiently
            visibleItems.value = all.slice(0, nextCount)

            // Recursively schedule next batch if needed
            if (nextCount < all.length) {
                scheduleChunk(all, nextCount)
            }
        })
    }

    return {
        visibleItems
    }
}
