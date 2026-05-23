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
import { formatTimeAgo } from "@core/utils/formatters";
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
  data: Ref<readonly T[]> | ComputedRef<readonly T[]>;
  isHydrated?: Ref<boolean> | ComputedRef<boolean>;
  currentSource?: Ref<"SUPABASE" | null> | ComputedRef<"SUPABASE" | null>;
  remoteSyncTime?: Ref<number | null> | ComputedRef<number | null>;
  lastCompiledTime?: Ref<number | null> | ComputedRef<number | null>;
  lastFetchedTime?: Ref<number | null> | ComputedRef<number | null>;
  filterFn: (item: T) => string[];
  sortStrategies: Record<string, (a: T, b: T) => number>;
  sortOptions?: { label: string; value: string; desc?: string; fullDesc?: string }[];
  showSearch?: boolean;
  defaultSort: string;
  deepLinkPrefix: string;
  batchIdMapper: (item: T) => string;
  statsLabel: string;
  scoreGetter?: (item: T) => number;
  refresh?: () => void | Promise<void>;
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
 * The primary orchestrator for complex list views.
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

  const showSkeletons = computed(() => {
    if (isShowcase.value) return false;
    if (isBlueprintMode.value) return true;
    return (
      !isSyntheticMode.value &&
      !syncError.value &&
      (!isHydrated.value || (isRefreshing.value && (!data.value || data.value.length === 0)))
    );
  });

  const selectedSet = computed(() => new Set(selectedIds.value));

  function handleSelectAll() {
    const ids = filteredItems.value.map(batchIdMapper);
    setForceSelectionMode(false);
    selectAll(ids);
  }

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
    data,
    layoutProps,
    layoutEvents,
    refresh: refreshFn,
    updateSort,
    toggleSelect,
    toggleExpand,
    clearSelection,
    handleSelectAll,
    handleSelectScore,
    handleSearch: (query: string) => (searchQuery.value = query),
    setForceSelectionMode,
    processDeepLink,
    getCardMetadata: (id: string): ConsoleCardMetadata => ({
      expanded: expandedIds.value.has(id),
      selected: selectedSet.value.has(id),
      selectionMode: isSelectionMode.value,
      isTagged: data.value?.playerTag === id,
      appIsRefreshing: isRefreshing.value && expandedIds.value.has(id),
    }),
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
