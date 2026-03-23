// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

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
import { useClashDataStore } from "./useClashDataStore";
import { storeToRefs } from "pinia";
import { computed, watch, onUnmounted, type Ref, type ComputedRef } from "vue";
import { formatTimeAgo } from "@core/utils/formatters";
import { DEFAULT_MOCK_MEMBER_COUNT, DEFAULT_MOCK_RECRUIT_COUNT } from "@core/utils/mockData";

/**
 * CONFIGURATION: ConsoleLogicOptions
 *
 * @remarks
 * Defines the configuration contract for the useConsoleController.
 * This ensures that various list-based features (Roster, Headhunter)
 * can be orchestrated through a unified interface.
 */
interface ConsoleLogicOptions<T> {
  /** The authoritative reactive source of items to be displayed. */
  data: Ref<readonly T[]> | ComputedRef<readonly T[]>;
  /** Indicates if the initial local storage hydration has finished. */
  isHydrated?: Ref<boolean> | ComputedRef<boolean>;
  /** Indicates if a background network sync (GAS or Worker) is in progress. */
  isRefreshing?: Ref<boolean> | ComputedRef<boolean>;
  /** Any error message encountered during the last synchronization attempt. */
  syncError?: Ref<string | null> | ComputedRef<string | null>;
  /** Epoch timestamp representing the last successful remote data refresh. */
  lastSyncTime?: Ref<number | null> | ComputedRef<number | null>;
  /** The identified backend source that provided the current dataset. */
  currentSource?: Ref<"WORKER" | "GAS" | null> | ComputedRef<"WORKER" | "GAS" | null>;
  /** Epoch timestamp of when the Cloud Worker Hub last synced with the Royale API. */
  hubSyncTime?: Ref<number | null> | ComputedRef<number | null>;
  /** Returns an array of strings per item used for search filtering. */
  filterFn: (item: T) => string[];
  /** A dictionary of sorting strategies keyed by their UI identifier. */
  sortStrategies: Record<string, (a: T, b: T) => number>;
  /** The UI identifier of the default sorting strategy. */
  defaultSort: string;
  /** Prefix used for URL hash deep linking (e.g., 'member-'). */
  deepLinkPrefix: string;
  /** Maps an item to its unique identifier for batch selection operations. */
  batchIdMapper: (item: T) => string;
  /** Singular display label for the item type (e.g., 'Member'). */
  statsLabel: string;
  /** The name of the tab in the backing Google Sheet for external linking. */
  sheetName?: string | string[];
  /** Optional function to extract a numeric score for threshold-based selection. */
  scoreGetter?: (item: T) => number;
  /** Trigger function to initiate a fresh data sync from the remote backend. */
  refresh?: () => void | Promise<void>;
  /** Optional handler for the FAB dismissal event (defaults to clearSelection). */
  onDismiss?: () => void;
}

/**
 * COMPOSABLE: useConsoleController
 *
 * @remarks
 * The primary orchestrator for complex list views (Leaderboard and Recruit Hub).
 * It coordinates multiple specialized composables to provide a unified "Console"
 * experience including searching, sorting, selection, and deep-linking.
 *
 * **Architecture:**
 * - **Structural Unitary Architecture:** Acts as a Layer 1 orchestrator,
 *   bridging domain-blind infrastructure with feature-level requirements.
 * - **Dependency Inversion:** Higher layers (Features) depend on this
 *   controller's abstraction rather than individual infra services.
 *
 * **Side Effects:**
 * - **UI Coordination:** Mutates `useUiCoordinator` state to manage the visibility
 *   of the batch action Floating Action Button (FAB).
 * - **Deep Linking:** Auto-processes URL hashes on hydration to expand items.
 * - **Lifecycle Management:** Cleans up global UI states on unmount.
 *
 * @param options - Configuration payload adhering to the ConsoleLogicOptions contract.
 * @returns
 * - `searchQuery`: Reactive search string.
 * - `sortBy`: Current active sorting key.
 * - `visibleItems`: Paginated subset of filtered and sorted items.
 * - `expandedIds`: IDs of items currently expanded in the UI.
 * - `selectedIds`: IDs of items in the batch selection queue.
 * - `selectedSet`: Computed Set of selected IDs for O(1) membership checks.
 * - `fabState`: UI state for the batch action FAB.
 * - `isSelectionMode`: Boolean flag for active selection state.
 * - `status`: Tiered system health status (text/type).
 * - `statsBadge`: Item counter for the header.
 * - `showSkeletons`: Shimmer visibility flag.
 * - `layoutProps`: Consolidated object for direct injection into `ConsoleLayout`.
 */
export function useConsoleController<T extends { id: string }>(
  options: ConsoleLogicOptions<T>,
) {
  // [PERF] SINGLETON HOOKS: Hoisted to the top for consistent initialization and better readability.
  const clashStore = useClashDataStore();
  const {
    isHydrated: storeHydrated,
    isRefreshing: storeRefreshing,
    syncError: storeSyncError,
    lastSyncTime: storeLastSync,
    currentSource: storeSource,
    hubSyncTime: storeHubSync,
  } = storeToRefs(clashStore);

  const {
    data,
    isHydrated = storeHydrated,
    isRefreshing = storeRefreshing,
    syncError = storeSyncError,
    lastSyncTime = storeLastSync,
    currentSource = storeSource,
    hubSyncTime = storeHubSync,
    filterFn,
    sortStrategies,
    defaultSort,
    deepLinkPrefix,
    batchIdMapper,
    statsLabel,
    sheetName,
    scoreGetter,
    refresh: refreshFn,
    onDismiss: onDismissFn,
  } = options;

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
    // to keep the visual demo clean and focused for presentations.
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
    // Priority 0: Critical configuration missing (Action Required)
    if (apiStatus.value === "unconfigured")
      return { type: "error", text: "Configure URL" } as const;

    // Priority 1: Handshake with GAS cold start (server waking)
    if (apiStatus.value === "waking" || apiStatus.value === "stale")
      return { type: "loading", text: "Waking Server..." } as const;

    // Priority 2: Physical network disconnect (Logical Offline)
    if (connectionStatus.value === "offline")
      return { type: "error", text: "Offline" } as const;

    // Priority 3: Remote execution or fetch failure (Synchronous error)
    if (syncError.value) return { type: "error", text: "Load Failed" } as const;

    // Priority 4: Background sync in progress (Only show if UI is empty)
    if (isRefreshing.value && (!data.value || data.value.length === 0))
      return { type: "loading", text: "Syncing..." } as const;

    // Priority 5: Success (Display last sync time for eventual consistency)
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
    // MODE GUARDS: Demo modes handle their own skeleton logic to maintain visual consistency.
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

  /**
   * LAYOUT PROPS (Standardized Interface)
   *
   * @remarks
   * Groups all reactive properties intended for ConsoleLayout into a
   * single object to minimize boilerplate in the view layer.
   * This facilitates the "Structural Purity" goal of the Optimize agent.
   */
  const layoutProps = computed(() => ({
    status: status.value,
    loading: showSkeletons.value,
    isRefreshing: isRefreshing.value,
    syncError: syncError.value || undefined,
    sheetUrl: sheetUrl.value,
    stats: statsBadge.value,
    fabState: fabState.value,
    isSelectionMode: isSelectionMode.value,
    selectedCount: selectedIds.value.length,
    totalCount: filteredItems.value.length,
    currentSort: sortBy.value,
    isEmpty: !showSkeletons.value && filteredItems.value.length === 0,
    hubInfo: currentSource?.value ? {
      source: currentSource.value,
      hubAge: hubSyncTime?.value ? formatTimeAgo(new Date(hubSyncTime.value).toISOString()) : null
    } : undefined
  }));

  /**
   * LAYOUT EVENTS (Standardized Interface)
   *
   * @remarks
   * Maps UI events from ConsoleLayout directly to controller methods.
   * This facilitates the "Structural Purity" goal by allowing
   * bulk event binding in the view: <ConsoleLayout v-on="layoutEvents" />
   */
  const layoutEvents = computed(() => ({
    refresh: refreshFn,
    "update:search": (val: string) => (searchQuery.value = val),
    "update:sort": updateSort,
    "select-all": handleSelectAll,
    "clear-selection": clearSelection,
    "select-score": handleSelectScore,
    "fab-action": handleAction,
    "fab-blitz": handleBlitz,
    "fab-dismiss": onDismissFn || clearSelection,
  }));

  return {
    // State & Computed
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
    currentSource,
    hubSyncTime,
    layoutProps,
    layoutEvents,

    // Actions
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
