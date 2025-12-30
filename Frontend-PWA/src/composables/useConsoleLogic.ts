import { computed, watch, onUnmounted, type Ref, type ComputedRef } from 'vue'
import { useBatchQueue } from './useBatchQueue'
import { useDeepLinkHandler } from './useDeepLinkHandler'
import { useListFilter } from './useListFilter'
import { useUiCoordinator } from './useUiCoordinator'
import { useProgressiveList } from './useProgressiveList'
import { formatTimeAgo } from '../utils/formatters'

interface ConsoleLogicOptions<T> {
    data: Ref<T[]>
    isHydrated: Ref<boolean>
    isRefreshing: Ref<boolean>
    syncError: Ref<string | null>
    lastSyncTime: Ref<number | null>
    filterFn: (item: T) => string[]
    sortStrategies: Record<string, (a: T, b: T) => number>
    defaultSort: string
    deepLinkPrefix: string
    batchIdMapper: (item: T) => string
    statsLabel: string
}

export function useConsoleLogic<T extends { id: string }>(options: ConsoleLogicOptions<T>) {
    const {
        data, isHydrated, isRefreshing, syncError, lastSyncTime,
        filterFn, sortStrategies, defaultSort, deepLinkPrefix, batchIdMapper, statsLabel
    } = options

    // 1. Filtering & Sorting
    const { searchQuery, sortBy, filteredItems, updateSort } = useListFilter(
        data,
        filterFn,
        sortStrategies,
        defaultSort
    )

    // 2. Progressive Rendering (Batch size 8 matches skeletons)
    // ⚡ PERFORMANCE: Only render what's needed initially
    const { visibleItems } = useProgressiveList(filteredItems, 8)

    // 3. Batch Actions / Selection
    const {
        selectedIds, fabState, isSelectionMode,
        toggleSelect, selectAll, clearSelection,
        handleAction, handleBlitz, setForceSelectionMode
    } = useBatchQueue()

    // 4. Deep Linking
    const { expandedIds, toggleExpand, processDeepLink } = useDeepLinkHandler(deepLinkPrefix)

    // 5. FAB Coordination
    const { setFabVisible } = useUiCoordinator()
    watch(() => fabState.value.visible, (visible) => setFabVisible(!!visible))
    onUnmounted(() => setFabVisible(false))

    // 6. Watch for data changes to re-process deep links
    watch(data, (newVal) => {
        if (newVal.length > 0) processDeepLink(newVal)
    }, { immediate: true })

    // 7. Computed Status
    const status = computed(() => {
        if (syncError.value) return { type: 'error', text: 'Retry' } as const
        if (isRefreshing.value) return { type: 'loading', text: 'Syncing...' } as const
        if (data.value.length > 0) return { type: 'ready', text: formatTimeAgo(new Date(lastSyncTime.value || Date.now()).toISOString()) } as const
        return { type: 'ready', text: 'Empty' as const }
    })

    // 8. Stats Badge
    const statsBadge = computed(() => ({
        label: statsLabel,
        value: data.value.length.toString()
    }))

    // 9. Skeleton State
    const showSkeletons = computed(() => !isHydrated.value || (isRefreshing.value && data.value.length === 0))

    // 10. Helper for Selection
    const selectedSet = computed(() => new Set(selectedIds.value))

    function handleSelectAll() {
        const ids = filteredItems.value.map(batchIdMapper)
        setForceSelectionMode(false)
        selectAll(ids)
    }

    function handleSelectScore(threshold: number, mode: 'ge' | 'le', scoreGetter: (item: T) => number) {
        const ids = filteredItems.value.filter((item: T) => {
            const s = scoreGetter(item)
            return mode === 'ge' ? s >= threshold : s <= threshold
        }).map(batchIdMapper)
        setForceSelectionMode(ids.length === 0)
        selectAll(ids)
    }

    return {
        // State
        searchQuery,
        sortBy,
        visibleItems,
        expandedIds,
        selectedIds,
        selectedSet,
        fabState,
        isSelectionMode,
        status,
        statsBadge,
        showSkeletons,
        filteredItems, // exposed for specific checks

        // Actions
        updateSort,
        toggleSelect,
        toggleExpand,
        clearSelection,
        handleAction,
        handleBlitz,
        handleSelectAll,
        handleSelectScore,
        setForceSelectionMode
    }
}
