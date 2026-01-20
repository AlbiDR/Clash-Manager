import { computed, watch, onUnmounted, type Ref, type ComputedRef } from "vue";
import { useBatchQueue } from "./useBatchQueue";
import { useDeepLinkHandler } from "./useDeepLinkHandler";
import { useListFilter } from "./useListFilter";
import { useUiCoordinator } from "./useUiCoordinator";
import { useProgressiveList } from "./useProgressiveList";
import { useConnectionStatus } from "./useConnectionStatus"; // Fix 24: Unify Status
import { useSyntheticMode } from "./useSyntheticMode";
import { useBlueprintMode } from "./useBlueprintMode";
import { useShowcaseMode } from "./useShowcaseMode";
import { formatTimeAgo } from "../utils/formatters";
import { generateMockData } from "../utils/mockData";

interface ConsoleLogicOptions<T> {
  data: Ref<readonly T[]> | ComputedRef<readonly T[]>;
  isHydrated: Ref<boolean> | ComputedRef<boolean>;
  isRefreshing: Ref<boolean> | ComputedRef<boolean>;
  syncError: Ref<string | null> | ComputedRef<string | null>;
  lastSyncTime: Ref<number | null> | ComputedRef<number | null>;
  filterFn: (item: T) => string[];
  sortStrategies: Record<string, (a: T, b: T) => number>;
  defaultSort: string;
  deepLinkPrefix: string;
  batchIdMapper: (item: T) => string;
  statsLabel: string;
}

export function useConsoleController<T extends { id: string }>(
  options: ConsoleLogicOptions<T>,
) {
  const {
    data,
    isHydrated,
    isRefreshing,
    syncError,
    lastSyncTime,
    filterFn,
    sortStrategies,
    defaultSort,
    deepLinkPrefix,
    batchIdMapper,
    statsLabel,
  } = options;

  // 1. Filtering & Sorting
  const { searchQuery, sortBy, filteredItems, updateSort } = useListFilter(
    data,
    filterFn,
    sortStrategies,
    defaultSort,
  );

  // 2. Progressive Rendering (Batch size 8 matches skeletons)
  // ⚡ PERFORMANCE: Only render what's needed initially
  const { visibleItems: allVisibleItems } = useProgressiveList(
    filteredItems,
    8,
  );
  const visibleItems = computed(() => {
    if (useShowcaseMode().isShowcaseMode.value) {
      return filteredItems.value;
    }
    return allVisibleItems.value;
  });

  // 3. Batch Actions / Selection
  const {
    selectedIds,
    fabState,
    isSelectionMode,
    toggleSelect,
    selectAll,
    clearSelection,
    handleAction,
    handleBlitz,
    setForceSelectionMode,
  } = useBatchQueue();

  // 4. Deep Linking
  const { expandedIds, toggleExpand, processDeepLink } =
    useDeepLinkHandler(deepLinkPrefix);

  // 5. FAB Coordination
  const { setFabVisible } = useUiCoordinator();
  watch(
    () => fabState.value.visible,
    (visible) => setFabVisible(!!visible),
  );
  onUnmounted(() => setFabVisible(false));

  // 6. Watch for data changes to re-process deep links
  watch(
    data,
    (newVal) => {
      if (newVal && newVal.length > 0) processDeepLink(newVal as T[]);
    },
    { immediate: true },
  );

  // 7. Computed Status
  // Fix 24: Unified Status Source of Truth
  const { status: connectionStatus } = useConnectionStatus();

  const status = computed(() => {
    // Priority 0: Hard Offline (Match SettingsView)
    if (connectionStatus.value === "offline")
      return { type: "error", text: "Offline" } as const;

    // Priority 1: Sync Error
    if (syncError.value) return { type: "error", text: "Retry" } as const;

    // Priority 2: Empty/First Load
    // Fix 22: Empty State vs Loading State
    if (isRefreshing.value && (!data.value || data.value.length === 0))
      return { type: "loading", text: "Syncing..." } as const;

    // Priority 3: Data Ready
    if (data.value && data.value.length > 0)
      return {
        type: "ready" as const,
        text: formatTimeAgo(
          new Date(lastSyncTime.value || Date.now()).toISOString(),
        ),
      };

    return { type: "ready" as const, text: "Empty" };
  });

  // 8. Stats Badge
  const statsBadge = computed(() => {
    const { isBlueprintMode } = useBlueprintMode();
    const { isShowcaseMode } = useShowcaseMode();

    let count = 0;
    if (isBlueprintMode.value || isShowcaseMode.value) {
      const mockData = generateMockData();
      count = statsLabel === "Member" ? mockData.lb.length : mockData.hh.length;
    } else {
      count = data.value ? data.value.length : 0;
    }

    // ⚡ DYNAMIC PLURALIZATION
    // Ensures "1 Member" and "50 Members" consistency
    const displayLabel = count === 1 ? statsLabel : `${statsLabel}s`;

    return {
      label: displayLabel,
      value: count.toString(),
    };
  });

  // 9. Skeleton State
  const { isSyntheticMode } = useSyntheticMode();
  const { isBlueprintMode } = useBlueprintMode();
  const { isShowcaseMode } = useShowcaseMode();

  const showSkeletons = computed(() => {
    if (isShowcaseMode.value) return false; // In showcase, we show real card
    if (isBlueprintMode.value) return true;
    // Original logic, now combined with synthetic mode check
    return (
      !isSyntheticMode.value && // Only show skeletons if not in synthetic mode
      !syncError.value &&
      (!isHydrated.value ||
        (isRefreshing.value && (!data.value || data.value.length === 0)))
    );
  });

  // 10. Helper for Selection
  const selectedSet = computed(() => new Set(selectedIds.value));

  function handleSelectAll() {
    const ids = filteredItems.value.map(batchIdMapper);
    setForceSelectionMode(false);
    selectAll(ids);
  }

  function handleSelectScore(
    threshold: number,
    mode: "ge" | "le",
    scoreGetter: (item: T) => number,
  ) {
    const ids = filteredItems.value
      .filter((item: T) => {
        const s = scoreGetter(item);
        return mode === "ge" ? s >= threshold : s <= threshold;
      })
      .map(batchIdMapper);
    setForceSelectionMode(ids.length === 0);
    selectAll(ids);
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
    filteredItems,

    // Actions
    updateSort,
    toggleSelect,
    toggleExpand,
    clearSelection,
    handleAction,
    handleBlitz,
    handleSelectAll,
    handleSelectScore,
    setForceSelectionMode,
    processDeepLink,
  };
}
