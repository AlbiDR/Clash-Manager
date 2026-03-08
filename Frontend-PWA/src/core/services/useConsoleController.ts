import { useListFilter } from "./useListFilter";
import { useProgressiveList } from "./useProgressiveList";
import { useUiCoordinator } from "./useUiCoordinator";
import { useConnectionStatus } from "./useConnectionStatus";
import { useApiState } from "../api/useApiState";
import { useBatchQueue } from "./useBatchQueue";
import { useBlueprintMode } from "./useBlueprintMode";
import { useDeepLinkHandler } from "./useDeepLinkHandler";
import { useShowcaseMode } from "./useShowcaseMode";
import { useSyntheticMode } from "./useSyntheticMode";
import { computed, watch, onUnmounted, type Ref, type ComputedRef } from "vue";
import { formatTimeAgo } from "@core/utils/formatters";
import { DEFAULT_MOCK_MEMBER_COUNT, DEFAULT_MOCK_RECRUIT_COUNT } from "@core/utils/mockData";

/**
 * CONFIGURATION: ConsoleLogicOptions
 *
 * @param data - The source reactive list of items (Members or Recruits).
 * @param isHydrated - Indicates if the initial local storage hydration has finished.
 * @param isRefreshing - Indicates if a background network sync is in progress.
 * @param syncError - Any error message from the last sync attempt.
 * @param lastSyncTime - Epoch timestamp of the last successful data refresh.
 * @param filterFn - Predicate returning an array of searchable strings for each item.
 * @param sortStrategies - Map of sorting functions for the list.
 * @param defaultSort - The initial sorting key to use.
 * @param deepLinkPrefix - The URL hash prefix for expansion (e.g., 'member-').
 * @param batchIdMapper - Maps an item to its unique selection ID.
 * @param statsLabel - Singular label for the count (e.g., 'Member').
 */
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
  sheetName?: string | string[];
  scoreGetter?: (item: T) => number;
  refresh?: () => void | Promise<void>;
}

/**
 * COMPOSABLE: useConsoleController
 *
 * @remarks
 * The primary orchestrator for complex list views (Leaderboard and Recruit Hub).
 * It coordinates multiple specialized composables to provide a unified "Console"
 * experience including searching, sorting, selection, and deep-linking.
 *
 * @returns
 * - searchQuery: Reactive search string.
 * - sortBy: Current active sorting key.
 * - visibleItems: The final subset of items to render (filtered + sorted + paginated).
 * - expandedIds: IDs of items currently expanded in the UI.
 * - selectedIds: IDs of items currently in the batch selection queue.
 * - selectedSet: Computed Set of selected IDs for O(1) lookup.
 * - fabState: Reactive state of the batch action Floating Action Button.
 * - isSelectionMode: Boolean flag indicating if selection mode is active.
 * - status: Computed object {type, text} describing the system health state.
 * - statsBadge: Computed object {label, value} for the item counter.
 * - showSkeletons: Boolean flag to trigger loading states.
 * - filteredItems: The full list of items matching the current search query.
 * - updateSort: Method to change the active sorting strategy.
 * - toggleSelect: Method to add/remove an item from selection.
 * - toggleExpand: Method to expand/collapse an item's details.
 * - clearSelection: Method to reset the selection queue.
 * - handleAction: Method to execute a batch action on selected items.
 * - handleBlitz: Method to open all selected items in external apps.
 * - handleSelectAll: Method to select all currently filtered items.
 * - handleSelectScore: Method to select items based on a numeric threshold.
 * - setForceSelectionMode: Method to manually override selection mode visibility.
 * - processDeepLink: Method to trigger expansion based on URL hash.
 *
 * @sideeffects
 * - Updates the UiCoordinator to manage FAB visibility.
 * - Processes deep links on data initialization to auto-expand specific items.
 * - Manages state synchronization for batch operations.
 */
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
    sheetName,
    scoreGetter,
    refresh: refreshFn,
  } = options;

  // [PERF] SINGLETON HOOKS: Hoisted to the top for consistent initialization and better readability.
  const { isShowcaseMode: isShowcase } = useShowcaseMode();
  const { isSyntheticMode } = useSyntheticMode();
  const { isBlueprintMode } = useBlueprintMode();
  const { status: connectionStatus } = useConnectionStatus();
  const { apiStatus, pingData } = useApiState();
  const { setFabVisible } = useUiCoordinator();

  // STEP 1: Search and Filter logic
  const { searchQuery, sortBy, filteredItems, updateSort } = useListFilter(
    data,
    filterFn,
    sortStrategies,
    defaultSort,
  );

  // STEP 2: Pagination/Virtualization logic
  const { visibleItems: allVisibleItems } = useProgressiveList(
    filteredItems,
    8,
  );
  
  const visibleItems = computed(() => {
    // CONSTRAINT: In Showcase mode, we only show a single card
    // to keep the visual demo clean and focused.
    if (isShowcase.value) {
      return filteredItems.value.length > 0 ? filteredItems.value.slice(0, 1) : [];
    }
    return allVisibleItems.value;
  });

  // STEP 3: Batch Selection logic
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

  // STEP 4: Deep Linking and Expansion logic
  const { expandedIds, toggleExpand, processDeepLink } =
    useDeepLinkHandler(deepLinkPrefix);

  // COORDINATION: Sync FAB visibility with global UI state
  watch(
    () => fabState.value.visible,
    (visible) => setFabVisible(!!visible),
  );
  onUnmounted(() => setFabVisible(false));

  // INITIALIZATION: Auto-process deep links when data first hydrates
  watch(
    data,
    (newVal) => {
      if (newVal && newVal.length > 0) processDeepLink(newVal as T[]);
    },
    { immediate: true },
  );

  /**
   * BACKING SHEET LINK
   */
  const sheetUrl = computed(() => {
    if (!pingData.value?.spreadsheetUrl || !pingData.value?.sheets || !sheetName)
      return undefined;

    const names = Array.isArray(sheetName) ? sheetName : [sheetName];
    let gid: number | undefined;

    for (const name of names) {
      gid = pingData.value.sheets[name];
      if (gid !== undefined) break;
    }

    return gid !== undefined
      ? `${pingData.value.spreadsheetUrl}#gid=${gid}`
      : pingData.value.spreadsheetUrl;
  });

  /**
   * SYSTEM STATUS RESOLVER
   *
   * @remarks
   * Implements a 6-tier priority hierarchy to ensure the most critical
   * information is always visible to the user.
   */
  const status = computed(() => {
    // Priority 0: Critical configuration missing
    if (apiStatus.value === "unconfigured")
      return { type: "error", text: "Configure URL" } as const;

    // Priority 1: Handshake with GAS cold start (server waking)
    if (apiStatus.value === "waking" || apiStatus.value === "stale")
      return { type: "loading", text: "Waking Server..." } as const;

    // Priority 2: Physical network disconnect
    if (connectionStatus.value === "offline")
      return { type: "error", text: "Offline" } as const;

    // Priority 3: Remote execution or fetch failure
    if (syncError.value) return { type: "error", text: "Load Failed" } as const;

    // Priority 4: Background sync in progress (with no cached data)
    if (isRefreshing.value && (!data.value || data.value.length === 0))
      return { type: "loading", text: "Syncing..." } as const;

    // Priority 5: Success (Display last sync time)
    if (data.value && data.value.length > 0)
      return {
        type: "ready" as const,
        text: formatTimeAgo(
          new Date(lastSyncTime.value || Date.now()).toISOString(),
        ),
      };

    return { type: "ready" as const, text: "Empty" };
  });

  /**
   * STATISTICS BADGE
   * Displays the count of active items, adjusted for special UI modes.
   */
  const statsBadge = computed(() => {
    let count = 0;
    if (isShowcase.value) {
      count = 1;
    } else if (isBlueprintMode.value) {
      // PERFORMANCE: Avoid calling generateMockData() just to get length.
      // Use static counts that match mockData defaults.
      count = statsLabel === "Member" ? DEFAULT_MOCK_MEMBER_COUNT : DEFAULT_MOCK_RECRUIT_COUNT;
    } else {
      count = data.value ? data.value.length : 0;
    }

    const displayLabel = count === 1 ? statsLabel : `${statsLabel}s`;

    return {
      label: displayLabel,
      value: count.toString(),
    };
  });

  /**
   * SKELETON VISIBILITY
   * Controls when to show the shimmer loading states.
   */
  const showSkeletons = computed(() => {
    // MODE GUARDS: Demo modes handle their own visibility
    if (isShowcase.value) return false;
    if (isBlueprintMode.value) return true;

    // DEFAULT LOGIC:
    // Show skeletons if not in synthetic mode, no errors, AND
    // either hydration is pending OR a fresh sync is happening on empty data.
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

  function handleSearch(val: string) {
    searchQuery.value = val;
  }

  /**
   * BULK SELECTION BY SCORE
   * Allows selecting all items above or below a specific score threshold.
   */
  function handleSelectScore(
    threshold: number,
    mode: "ge" | "le",
    customScoreGetter?: (item: T) => number,
  ) {
    const getter = customScoreGetter || scoreGetter;
    if (!getter) return;

    const ids = filteredItems.value
      .filter((item: T) => {
        const s = getter(item);
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
    sheetUrl,
    isRefreshing,
    syncError,
    isHydrated,
    refresh: refreshFn,
    updateSort,
    toggleSelect,
    toggleExpand,
    clearSelection,
    handleAction,
    handleBlitz,
    handleSelectAll,
    handleSelectScore,
    handleSearch,
    setForceSelectionMode,
    processDeepLink,
  };
}
