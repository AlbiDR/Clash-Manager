import { computed, watch, onUnmounted, type Ref, type ComputedRef } from "vue";
import { useBatchQueue } from "./useBatchQueue";
import { useDeepLinkHandler } from "./useDeepLinkHandler";
import { useListFilter } from "./useListFilter";
import { useUiCoordinator } from "./useUiCoordinator";
import { useProgressiveList } from "./useProgressiveList";
import { useConnectionStatus } from "./useConnectionStatus";
import { useApiState } from "./useApiState"; 
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

  const { searchQuery, sortBy, filteredItems, updateSort } = useListFilter(
    data,
    filterFn,
    sortStrategies,
    defaultSort,
  );

  const { visibleItems: allVisibleItems } = useProgressiveList(
    filteredItems,
    8,
  );
  
  const visibleItems = computed(() => {
    if (useShowcaseMode().isShowcaseMode.value) {
      return filteredItems.value.length > 0 ? filteredItems.value.slice(0, 1) : [];
    }
    return allVisibleItems.value;
  });

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

  const { expandedIds, toggleExpand, processDeepLink } =
    useDeepLinkHandler(deepLinkPrefix);

  const { setFabVisible } = useUiCoordinator();
  watch(
    () => fabState.value.visible,
    (visible) => setFabVisible(!!visible),
  );
  onUnmounted(() => setFabVisible(false));

  watch(
    data,
    (newVal) => {
      if (newVal && newVal.length > 0) processDeepLink(newVal as T[]);
    },
    { immediate: true },
  );

  const { status: connectionStatus } = useConnectionStatus();
  const { apiStatus } = useApiState();

  const status = computed(() => {
    // Priority 0: Configuration required
    if (apiStatus.value === "unconfigured")
      return { type: "error", text: "Configure URL" } as const;

    // Priority 1: ⚡ Waking/Stale (Handshake retry)
    if (apiStatus.value === "waking" || apiStatus.value === "stale")
      return { type: "loading", text: "Waking Server..." } as const;

    // Priority 2: Hard Offline
    if (connectionStatus.value === "offline")
      return { type: "error", text: "Offline" } as const;

    // Priority 3: Sync Error
    if (syncError.value) return { type: "error", text: "Load Failed" } as const;

    // Priority 4: Initial Loading
    if (isRefreshing.value && (!data.value || data.value.length === 0))
      return { type: "loading", text: "Syncing..." } as const;

    // Priority 5: Data Ready
    if (data.value && data.value.length > 0)
      return {
        type: "ready" as const,
        text: formatTimeAgo(
          new Date(lastSyncTime.value || Date.now()).toISOString(),
        ),
      };

    return { type: "ready" as const, text: "Empty" };
  });

  const statsBadge = computed(() => {
    const { isBlueprintMode } = useBlueprintMode();
    const { isShowcaseMode } = useShowcaseMode();

    let count = 0;
    if (isShowcaseMode.value) {
      count = 1;
    } else if (isBlueprintMode.value) {
      const mockData = generateMockData();
      count = statsLabel === "Member" ? mockData.lb.length : mockData.hh.length;
    } else {
      count = data.value ? data.value.length : 0;
    }

    const displayLabel = count === 1 ? statsLabel : `${statsLabel}s`;

    return {
      label: displayLabel,
      value: count.toString(),
    };
  });

  const { isSyntheticMode } = useSyntheticMode();
  const { isBlueprintMode } = useBlueprintMode();
  const { isShowcaseMode: isShowcase } = useShowcaseMode();

  const showSkeletons = computed(() => {
    if (isShowcase.value) return false;
    if (isBlueprintMode.value) return true;
    return (
      !isSyntheticMode.value &&
      !syncError.value &&
      (!isHydrated.value ||
        (isRefreshing.value && (!data.value || data.value.length === 0)))
    );
  });

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
