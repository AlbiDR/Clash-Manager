// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { useListFilter } from "./useListFilter";
import { useProgressiveList } from "./useProgressiveList";
import { useUiCoordinator } from "./useUiCoordinator";
import { useConnectionStatus } from "./useConnectionStatus";
import { useApiState } from "../api/useApiState";
import { useSelectionStore } from "./useSelectionStore";
import { useBlueprintMode } from "./useBlueprintMode";
import { useDeepLinkHandler } from "./useDeepLinkHandler";
import { useShowcaseMode } from "./useShowcaseMode";
import { useSyntheticMode } from "./useSyntheticMode";
import { useClashDataStore } from "./useClashDataStore";
import { useHaptics } from "./useHaptics";
import { storeToRefs } from "pinia";
import { ref, computed, watch, onMounted, onUnmounted, toRef, type Ref, type ComputedRef } from "vue";
import type { ConsoleCardMetadata, HubInfo } from "@core/types";
import { formatTimeAgo } from "@core";
import { DEFAULT_MOCK_MEMBER_COUNT, DEFAULT_MOCK_RECRUIT_COUNT } from "@core/utils/mockData";
import { VISIBILITY_REFRESH_THRESHOLD } from "../config";
import { useConsoleMetadata } from "./useConsoleMetadata";

/**
 * CONFIGURATION: ConsoleLogicOptions
 *
 * @remarks
 * Defines the configuration contract for the useConsoleController.
 */
interface ConsoleLogicOptions<T> {
  /** The reactive dataset to be managed by the controller. */
  data: Ref<readonly T[]> | ComputedRef<readonly T[]>;
  /** Optional hydration status override. */
  isHydrated?: Ref<boolean> | ComputedRef<boolean>;
  /** Optional data source provenance override. */
  currentSource?: Ref<"SUPABASE" | null> | ComputedRef<"SUPABASE" | null>;
  /** Optional remote sync timestamp override. */
  remoteSyncTime?: Ref<number | null> | ComputedRef<number | null>;
  /** Optional compilation timestamp override. */
  lastCompiledTime?: Ref<number | null> | ComputedRef<number | null>;
  /** Optional fetch timestamp override. */
  lastFetchedTime?: Ref<number | null> | ComputedRef<number | null>;
  /** Logic for extracting searchable tokens from an item. */
  filterFn: (item: T) => string[];
  /** Map of comparator functions for sorting. */
  sortStrategies: Record<string, (a: T, b: T) => number>;
  /** UI configuration for the sorting menu. */
  sortOptions?: { label: string; value: string; desc?: string; fullDesc?: string }[];
  /** Whether to enable the global search filter. */
  showSearch?: boolean;
  /** The initial sort strategy key. */
  defaultSort: string;
  /** Prefix used for deep-link URL fragments (e.g., 'member-'). */
  deepLinkPrefix: string;
  /** Mapper to extract a unique ID for batch selection. */
  batchIdMapper: (item: T) => string;
  /** Domain label for statistics (e.g., 'Member'). */
  statsLabel: string;
  /** Optional logic to extract a numeric performance score. */
  scoreGetter?: (item: T) => number;
  /** Optional override for the refresh action. */
  refresh?: () => void | Promise<void>;
  /** Optional callback for when the management FAB is dismissed. */
  onDismiss?: () => void;
  /** Optional FAB state override for feature-specific actions. */
  fabState?: ComputedRef<any> | Ref<any>;
  /** Optional layout events override. */
  layoutEvents?: ComputedRef<Record<string, any>> | Record<string, any>;
  /** Optional selection store override. */
  selectionStore?: ReturnType<typeof useSelectionStore>;
}

/**
 * COMPOSABLE: useConsoleController
 *
 * @remarks
 * The primary orchestrator for complex list views (Roster, Headhunter). It
 * encapsulates the logic for filtering, sorting, pagination, batch selection,
 * and deep-linking into a unified interface.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core Service (@core/services)
 * - **Role:** Orchestrator. Consolidates multiple specialized services into a
 *   standardized controller contract for Layer 3 feature views.
 *
 * Satisfies ADR Section III: Data Flow & Transactional Integrity by ensuring
 * all list-level mutations (sort/filter/select) are handled via reactive
 * controllers.
 *
 * @param options - Configuration for the controller.
 * @returns Standardized state and actions for driving a console view.
 */
export function useConsoleController<T extends { id: string; n?: string }>(
  options: ConsoleLogicOptions<T>,
) {
  const clashStore = useClashDataStore();
  const {
    data,
    isHydrated = toRef(clashStore, "isHydrated"),
    isRefreshing = toRef(clashStore, "loading"),
    syncError = toRef(clashStore, "syncError"),
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
    fabState: fabOverride,
    layoutEvents: eventsOverride,
    selectionStore: selectionOverride,
  } = options;

  const { isShowcaseMode: isShowcase } = useShowcaseMode();
  const { isSyntheticMode } = useSyntheticMode();
  const { isBlueprintMode } = useBlueprintMode();
  const { setFabVisible } = useUiCoordinator();

  // STEP 1: Search and Filter logic
  const { searchQuery, sortBy, filteredItems, updateSort } = useListFilter(
    data,
    filterFn,
    sortStrategies,
    defaultSort,
  );

  // STEP 2: Pagination/Virtualization logic
  const { visibleItems: allVisibleItems } = useProgressiveList(filteredItems, 8);
  const visibleItems = computed(() => {
    if (isShowcase.value) return allVisibleItems.value.slice(0, 1);
    return allVisibleItems.value;
  });

  // STEP 3: Batch Selection logic
  const {
    selectedIds,
    isSelectionMode,
    toggleSelect,
    selectAll,
    clearSelection,
    setForceSelectionMode,
  } = selectionOverride || useSelectionStore();

  // STEP 4: Metadata (Status & Stats)
  const { status, statsBadge, metadata, hubHealth } = useConsoleMetadata(
    statsLabel,
    computed(() => data.value.length),
  );

  // STEP 5: Deep Linking and Expansion logic
  const { expandedIds, toggleExpand, processDeepLink } = useDeepLinkHandler(deepLinkPrefix);

  // FAB Synchronization
  const fabState = computed(() => {
    if (fabOverride) return fabOverride.value;
    return {
      visible: isSelectionMode.value,
      label: "Done",
      isProcessing: false,
      isBlasting: false,
      selectionCount: selectedIds.value.length,
      blitzEnabled: false,
    };
  });

  watch(
    () => fabState.value?.visible,
    (visible) => setFabVisible(!!visible),
  );

  watch(
    data,
    (newVal) => {
      if (newVal && newVal.length > 0) processDeepLink(newVal as T[]);
    },
    { immediate: true },
  );

  let lastVisibilityTime = Date.now();
  /**
   * REVALIDATION: Visibility Change Handler
   *
   * @remarks
   * [DECISION LOG] AUTOMATIC REVALIDATION
   * Rationale: When the user returns to the app after it being in the background,
   * we trigger a refresh if the `VISIBILITY_REFRESH_THRESHOLD` has passed.
   * This ensures the UI accurately reflects the latest server-side state without
   * requiring a manual pull-to-refresh.
   */
  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      const now = Date.now();
      const hiddenDuration = now - lastVisibilityTime;
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

  /**
   * SKELETON RESOLUTION
   *
   * @remarks
   * [DECISION LOG] SKELETON DISPLAY PRIORITY
   * Logic: We show skeletons under three conditions:
   * 1. BLUEPRINT MODE: Explicitly requested for UI design/testing.
   * 2. INITIAL BOOT: Store is not yet hydrated and no sync error exists.
   * 3. ACTIVE REFRESH: Currently fetching and no existing data is available.
   *
   * We bypass skeletons in SYNTHETIC/SHOWCASE modes to ensure deterministic
   * high-fidelity rendering.
   */
  const showSkeletons = computed(() => {
    if (isShowcase.value) return false;
    if (isBlueprintMode.value) return true;
    return (
      !isSyntheticMode.value &&
      !syncError.value &&
      (!isHydrated.value || (isRefreshing.value && (!data.value || data.value.length === 0)))
    );
  });

  /** Optimized set for O(1) membership checks in the UI layer. */
  const selectedSet = computed(() => new Set(selectedIds.value));

  /** Action: Select all currently filtered items. */
  function handleSelectAll() {
    const ids = filteredItems.value.map(batchIdMapper);
    setForceSelectionMode(false);
    selectAll(ids);
  }

  /** Action: Select items based on a numeric score threshold. */
  function handleSelectScore(threshold: number, mode: "ge" | "le", customScoreGetter?: (item: T) => number) {
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
   * Standardized Props Contract for the ConsoleLayout.vue component.
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
      lastCompiled: metadata.value.lastCompiled,
    },
  }));

  /**
   * Standardized Events Contract for the ConsoleLayout.vue component.
   */
  const layoutEvents = computed(() => {
    const baseEvents = {
      refresh: refreshFn,
      "update:search": (query: string) => (searchQuery.value = query),
      "update:sort": updateSort,
      "select-all": handleSelectAll,
      "clear-selection": clearSelection,
      "select-score": handleSelectScore,
      "fab-dismiss": onDismissFn || clearSelection,
    };
    if (eventsOverride) {
      const overrides = computed(() => (typeof eventsOverride === "function" ? eventsOverride : (eventsOverride as any).value || eventsOverride));
      return { ...baseEvents, ...overrides.value };
    }
    return baseEvents;
  });

  return {
    /** The current reactive search query. */
    searchQuery,
    /** The current active sorting strategy key. */
    sortBy,
    /** The slice of items currently visible in the UI (pagination). */
    visibleItems,
    /** Set of item IDs currently expanded. */
    expandedIds,
    /** Array of item IDs currently selected. */
    selectedIds,
    /** Set of item IDs currently selected (optimized for lookups). */
    selectedSet,
    /** The resolved state of the Global FAB. */
    fabState,
    /** Indicates if the list is currently in multi-selection mode. */
    isSelectionMode,
    /** Indicates if the system is in showcase mode. */
    isShowcaseMode: isShowcase,
    /** Unified connectivity health status. */
    status,
    /** Item count badge configuration for the header. */
    statsBadge,
    /** Whether to display skeleton loaders. */
    showSkeletons,
    /** The fully filtered and sorted dataset. */
    filteredItems,
    /** Indicates if a background sync is in progress. */
    isRefreshing,
    /** The most recent synchronization error, if any. */
    syncError,
    /** Indicates if the underlying store has been hydrated. */
    isHydrated,
    /** Direct access to the source dataset. */
    data,
    /** Unified props for the ConsoleLayout component. */
    layoutProps,
    /** Unified events for the ConsoleLayout component. */
    layoutEvents,

    /** Triggers a manual synchronization with the backend. */
    refresh: refreshFn,
    /** Changes the active sorting strategy. */
    updateSort,
    /** Toggles selection for a specific item. */
    toggleSelect,
    /** Toggles expansion for a specific item. */
    toggleExpand,
    /** Clears the current selection. */
    clearSelection,
    /** Selects all filtered items. */
    handleSelectAll,
    /** Selects items based on a numeric score threshold. */
    handleSelectScore,
    /** Updates the current search query. */
    handleSearch: (query: string) => (searchQuery.value = query),
    /** Forces selection mode even if zero items are selected. */
    setForceSelectionMode,
    /** Manually triggers deep-link processing for the current dataset. */
    processDeepLink,

    /** Retrieves authoritative UI metadata for a specific item card. */
    getCardMetadata: (id: string): ConsoleCardMetadata => ({
      expanded: expandedIds.value.has(id),
      selected: selectedSet.value.has(id),
      selectionMode: isSelectionMode.value,
      isTagged: data.value?.playerTag === id,
      appIsRefreshing: isRefreshing.value && expandedIds.value.has(id),
    }),
    /** Generates a stable key array for use in Vue's memoization / keyed lists. */
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
