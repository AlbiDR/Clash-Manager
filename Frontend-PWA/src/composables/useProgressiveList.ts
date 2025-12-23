// @ts-nocheck
import { ref, computed, watch, type Ref } from 'vue'

export function useProgressiveList<T>(
    sourceList: Ref<T[]>, 
    pageSize: number = 20
) {
    const visibleCount = ref(pageSize)

    watch(sourceList, () => {
        // Reset when source changes (e.g. filter or sort)
        visibleCount.value = pageSize
        
        // Schedule the rest to render in the next frame
        // This allows the browser to paint the first `pageSize` items immediately
        if (typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(() => {
                // If the list is massive (>500), we might want to chunk it further,
                // but for <200 items, a single RAF update is usually optimal for UX/CLS balance.
                visibleCount.value = sourceList.value.length
            })
        } else {
            // Fallback for environments without RAF
            setTimeout(() => {
                visibleCount.value = sourceList.value.length
            }, 0)
        }
    }, { immediate: true, flush: 'post' })

    const visibleItems = computed(() => {
        // Optimization: return original array if full count is visible to preserve referential identity
        if (visibleCount.value >= sourceList.value.length) {
            return sourceList.value
        }
        return sourceList.value.slice(0, visibleCount.value)
    })

    return {
        visibleItems
    }
}
