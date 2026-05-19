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
import { useHaptics } from "./useHaptics";
import { storeToRefs } from "pinia";
import { ref, computed, watch, onMounted, onUnmounted, toRef, type Ref, type ComputedRef } from "vue";
import type { ConsoleCardMetadata, HubInfo } from "@core/types";
import { formatTimeAgo } from "@core/utils/formatters";
import { DEFAULT_MOCK_MEMBER_COUNT, DEFAULT_MOCK_RECRUIT_COUNT } from "@core/utils/mockData";
import { VISIBILITY_REFRESH_THRESHOLD } from "../config";
import { useConnectivityManager } from "./useConnectivityManager";

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
  /** The identified backend source that provided the current dataset. */
  currentSource?: Ref<"SUPABASE" | null> | ComputedRef<"SUPABASE" | null>;
  /** Epoch timestamp of when the remote Supabase view was last generated. */
  remoteSyncTime?: Ref<number | null> | ComputedRef<number | null>;
  /** Epoch timestamp of when the server last compiled the current dataset. */
  lastCompiledTime?: Ref<number | null> | ComputedRef<number | null>;
  /** Epoch timestamp of when the server last fetched raw data from the API. */
  lastFetchedTime?: Ref<number | null> | ComputedRef<number | null>;
  /** Returns an array of strings per item used for search filtering. */
  filterFn: (item: T) => string[];
  /** A dictionary of sorting strategies keyed by their UI identifier. */
  sortStrategies: Record<string, (a: T, b: T) => number>;
  /** Available sorting options for the UI. */
  sortOptions?: { label: string; value: string; desc?: string; fullDesc?: string }[];
  /** Whether to show the search input in the header. */
  showSearch?: boolean;
  /** The UI identifier of the default sorting strategy. */
  defaultSort: string;
  /** Prefix used for URL hash deep linking (e.g., 'member-'). */
  deepLinkPrefix: string;
  /** Maps an item to its unique identifier for batch selection operations. */
  batchIdMapper: (item: T) => string;
  /** Singular display label for the item type (e.g., 'Member'). */
  statsLabel: string;
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


export function useConsoleController<T extends { id: string; n?: string }>(
  options: ConsoleLogicOptions<T>,
) {
  // [PERF] SINGLETON HOOKS: Hoisted to the top for consistent initialization and better readability.
  const clashStore = useClashDataStore();
  const {
    isRefreshing: storeRefreshing,
    syncError: storeSyncError,
    lastSyncTime: storeLastSync,
    lastCompiledTime: storeLastCompiled,
    lastFetchedTime: storeLastFetched,
  } = storeToRefs(clashStore);

  const {
    data,
    isHydrated = toRef(clashStore, "isHydrated"),
    isRefreshing = toRef(clashStore, "loading"),
    syncError = toRef(clashStore, "syncError"),
    lastSyncTime = toRef(clashStore, "lastSyncTime"),
    currentSource = toRef(clashStore, "currentSource"),
    lastCompiledTime = toRef(clashStore, "lastCompiledTime"),
    lastFetchedTime = toRef(clashStore, "lastFetchedTime"),
    filterFn,
    sortStrategies,
    sortOptions,
    showSearch = true,
    defaultSort,
    deepLinkPrefix,
    batchIdMapper,
    statsLabel,
    scoreGetter,
    refresh: refreshFn = () => clashStore.refreshFromSupabase(),
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
    // [UI] BRANDING: In Showcase mode only the first card is shown so the
    // ConsoleList skeleton overlay carries the visual weight.
    if (isShowcase.value) return allVisibleItems.value.slice(0, 1);
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
  // INITIALIZATION: Auto-process deep links when data first hydrates
  watch(
    data,
    (newVal) => {
      if (newVal && newVal.length > 0) processDeepLink(newVal as T[]);
    },
    { immediate: true },
  );

  /**
   * VISIBILITY LIFECYCLE
   * Rationale: If the user returns to the app after a long period, we trigger
   * a silent refresh to ensure the "Nominal" status is actually accurate.
   */
  let lastVisibilityTime = Date.now();
  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      const now = Date.now();
      const hiddenDuration = now - lastVisibilityTime;
      
      // If hidden for > 30 minutes, trigger a background refresh
      if (hiddenDuration > VISIBILITY_REFRESH_THRESHOLD && !isRefreshing.value && refreshFn) {
        refreshFn();
      }
      lastVisibilityTime = now;
    } else {
      lastVisibilityTime = Date.now();
    }
  };

  onMounted(() => {
    document.addEventListener("visibilitychange", handleVisibilityChange);
  });

  onUnmounted(() => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    setFabVisible(false);
  });



    // --- STATUS RESOLVER (Layer 1 Connectivity) ---
    const { hubHealth, metadata, refresh: refreshHub } = useConnectivityManager();

    const status = computed(() => ({
      type: hubHealth.value.type,
      text: hubHealth.value.label,
      nominal: hubHealth.value.type === "success"
    }));

  /**
   * STATISTICS BADGE
   * Displays the count of active items, adjusted for special UI modes.
   */
  const statsBadge = computed(() => {
    let count: number;

    if (isShowcase.value) {
      // [UI] BRANDING: Randomised count (1-50) for visual variety in the
      // Showcase overlay without leaking real data.
      count = Math.floor(Math.random() * 50) + 1;
    } else if (isBlueprintMode.value) {
      // [UI] BRANDING: Use deterministic mock counts in Blueprint mode so
      // the badge always matches the synthetic dataset size.
      count =
        statsLabel === "Recruit"
          ? DEFAULT_MOCK_RECRUIT_COUNT
          : DEFAULT_MOCK_MEMBER_COUNT;
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

  function handleSearch(query: string) {
    searchQuery.value = query;
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
    const scoreExtractor = customScoreGetter || scoreGetter;
    if (!scoreExtractor) return;

    const ids = filteredItems.value
      .filter((item: T) => {
        const score = scoreExtractor(item);
        return mode === "ge" ? score >= threshold : score <= threshold;
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
    stats: statsBadge.value,
    sortOptions,
    showSearch,
    fabState: fabState.value,
    isSelectionMode: isSelectionMode.value,
    selectedCount: selectedIds.value.length,
    totalCount: filteredItems.value.length,
    currentSort: sortBy.value,
    isEmpty: !showSkeletons.value && filteredItems.value.length === 0,
    remoteInfo: {
      source: metadata.value.source,
      dataAge: metadata.value.age,
      diagnosis: hubHealth.value.diagnosis,
      lastCompiled: metadata.value.lastCompiled
    }
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
    "update:search": (query: string) => (searchQuery.value = query),
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
    isShowcaseMode: isShowcase,
    status,
    statsBadge,
    showSkeletons,
    filteredItems,
    isRefreshing,
    syncError,
    isHydrated,
    currentSource,
    data,
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

    /**
     * ITEM METADATA RESOLVER
     *
     * @remarks
     * Extracts UI-specific state flags for a given item ID.
     * Centralizing this logic ensures that performance optimizations (like v-memo)
     * are applied consistently across Roster and Headhunter views.
     */
    getCardMetadata: (id: string): ConsoleCardMetadata => ({
      expanded: expandedIds.value.has(id),
      selected: selectedSet.value.has(id),
      selectionMode: isSelectionMode.value,
      isTagged: data.value?.playerTag === id,
      // [PERF] SCOPED REFRESH: Only signal 'refreshing' to expanded cards
      // to prevent unnecessary re-renders of the entire collapsed list.
      appIsRefreshing: isRefreshing.value && expandedIds.value.has(id),
    }),

    /**
     * MEMOIZATION KEY GENERATOR
     *
     * @remarks
     * Centralizes the dependency list for Vue's `v-memo` directive.
     * This ensures that performance-critical re-render optimizations are
     * applied consistently across different feature views (Roster, Headhunter)
     * without duplicating complex dependency logic in templates.
     *
     * @param id - The unique item identifier.
     * @param extraKeys - Optional feature-specific reactive dependencies.
     * @returns A stable array of dependencies for `v-memo`.
     */
    getMemoKeys: (id: string, extraKeys: unknown[] = []) => [
      id,
      isSelectionMode.value,
      expandedIds.value.has(id),
      selectedSet.value.has(id),
      isRefreshing.value && expandedIds.value.has(id),
      data.value?.playerTag === id,
      ...extraKeys,
    ],
  };
}
