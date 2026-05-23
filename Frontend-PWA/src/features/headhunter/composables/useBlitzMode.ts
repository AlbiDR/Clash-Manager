// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { useAppSettings } from "@core/services/useAppSettings";
import { useExternalLink, buildDeepLink } from "@core/services/useExternalLink";
import { useToast } from "@core/services/useToast";
import { ref, computed, onUnmounted, getCurrentInstance } from "vue";
import { useSelectionStore } from "@core/services/useSelectionStore";

interface BlitzOptions {
  throttleMs?: number;
}

/**
 * COMPOSABLE: useBlitzMode
 *
 * @remarks
 * Orchestrates the "Recruitment Pipeline" for the Headhunter feature.
 * It manages a multi-tier deep-linking strategy for processing lists of items.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 3 (@features/headhunter)
 * - **Responsibility:** Manages recruitment selection and automated "Blitz" execution.
 *
 * **Side Effects:**
 * - Triggers global toast notifications via `useToast`.
 * - Invokes external application protocols via `useExternalLink`.
 *
 * @param selectionStore - The generalized selection store to use.
 * @param options - Configuration for throttling.
 * @returns Reactive state and handlers for batch recruitment operations.
 */
export function useBlitzMode(
  selectionStore: ReturnType<typeof useSelectionStore>,
  options: BlitzOptions = {}
) {
  const { throttleMs = 850 } = options;
  const { selectedIds, isSelectionMode, clearSelection } = selectionStore;

  /** Sequential queue of tags remaining to be opened. */
  const batchExecutionQueue = ref<string[]>([]);
  /** Timestamp of the last successful deep-link trigger. */
  const lastDeepLinkTriggerTime = ref(0);

  // Blitz State
  const isBlitzActive = ref(false);
  const blitzCurrentItemIndex = ref(0);
  let blitzOperationTimer: ReturnType<typeof setTimeout> | null = null;

  const { error, info } = useToast();
  const { modules } = useAppSettings();
  const { openInGame } = useExternalLink();

  /** Indicates if a manual batch queue is currently being processed. */
  const isProcessing = computed(() => batchExecutionQueue.value.length > 0);

  /**
   * Environment Trust Verification.
   */
  const isTrusted = computed(() => {
    if (typeof navigator === "undefined") return false;
    return true;
  });

  /**
   * UI State for the Floating Action Button (FAB).
   */
  const fabState = computed(() => {
    if (!isSelectionMode.value) {
      return {
        visible: false,
        label: "",
        actionHref: undefined,
        isProcessing: false,
        isBlasting: false,
        selectionCount: 0,
        blitzEnabled: false,
      };
    }

    const totalSelectedCount = selectedIds.value.length;
    let label = "Open";

    if (isBlitzActive.value) {
      label = `${blitzCurrentItemIndex.value + 1} / ${totalSelectedCount}`;
    } else if (totalSelectedCount > 0) {
      if (isProcessing.value) {
        const currentlyOpeningItemNumber = totalSelectedCount - batchExecutionQueue.value.length + 1;
        label = `Open (${currentlyOpeningItemNumber}/${totalSelectedCount})`;
      } else {
        label = `Open (1/${totalSelectedCount})`;
      }
    } else {
      label = "Select";
    }

    const targetId = isBlitzActive.value
      ? selectedIds.value[blitzCurrentItemIndex.value]
      : isProcessing.value
        ? batchExecutionQueue.value[0]
        : selectedIds.value[0];

    return {
      visible: true,
      label,
      actionHref: targetId ? buildDeepLink(targetId) : undefined,
      isProcessing: isProcessing.value,
      isBlasting: isBlitzActive.value,
      selectionCount: totalSelectedCount,
      blitzEnabled: modules.blitzMode && isTrusted.value,
    };
  });

  function stopBlitz() {
    isBlitzActive.value = false;
    if (blitzOperationTimer) {
      clearTimeout(blitzOperationTimer);
      blitzOperationTimer = null;
    }
  }

  function advanceBlitz() {
    if (!isBlitzActive.value) return;

    if (blitzCurrentItemIndex.value >= selectedIds.value.length) {
      stopBlitz();
      info("Blitz complete");
      return;
    }

    const activeRecruitId = selectedIds.value[blitzCurrentItemIndex.value];
    if (activeRecruitId) {
      openInGame(activeRecruitId);

      const safetyDelay = Math.max(throttleMs, 4000);
      if (blitzCurrentItemIndex.value < selectedIds.value.length - 1) {
        blitzOperationTimer = setTimeout(() => {
          blitzCurrentItemIndex.value++;
          advanceBlitz();
        }, safetyDelay);
      } else {
        blitzOperationTimer = setTimeout(() => {
          stopBlitz();
          info("Blitz complete");
        }, 1500);
      }
    } else {
      if (blitzCurrentItemIndex.value < selectedIds.value.length - 1) {
        blitzCurrentItemIndex.value++;
        advanceBlitz();
      } else {
        stopBlitz();
      }
    }
  }

  function handleBlitz() {
    if (isBlitzActive.value || selectedIds.value.length === 0) return;
    if (!isTrusted.value) {
      error("Environment verification failed");
      return;
    }

    isBlitzActive.value = true;
    blitzCurrentItemIndex.value = 0;
    advanceBlitz();
  }

  function handleAction(event: MouseEvent) {
    if (isBlitzActive.value) {
      event.preventDefault();
      const activeRecruitId = selectedIds.value[blitzCurrentItemIndex.value];
      if (activeRecruitId) {
        openInGame(activeRecruitId);
        blitzCurrentItemIndex.value++;

        if (blitzOperationTimer) {
          clearTimeout(blitzOperationTimer);
          blitzOperationTimer = setTimeout(advanceBlitz, Math.max(throttleMs, 2000));
        }
      }
      return;
    }

    const currentTime = Date.now();
    if (currentTime - lastDeepLinkTriggerTime.value < throttleMs) {
      event.preventDefault();
      return;
    }
    lastDeepLinkTriggerTime.value = currentTime;

    if (batchExecutionQueue.value.length === 0) {
      batchExecutionQueue.value = [...selectedIds.value];
    }

    const nextQueueId = batchExecutionQueue.value[0];
    if (nextQueueId) {
      openInGame(nextQueueId);
    }

    setTimeout(() => {
      if (batchExecutionQueue.value.length > 0) {
        batchExecutionQueue.value.shift();
      }
      if (batchExecutionQueue.value.length === 0) {
        info("Batch complete");
      }
    }, 150);
  }

  if (getCurrentInstance()) {
    onUnmounted(() => {
      stopBlitz();
    });
  }

  // Wrap clearSelection to ensure blitz is stopped
  const clearSelectionWithStop = () => {
    stopBlitz();
    clearSelection();
    batchExecutionQueue.value = [];
    blitzCurrentItemIndex.value = 0;
  };

  return {
    fabState,
    isProcessing,
    handleAction,
    handleBlitz,
    stopBlitz,
    clearSelection: clearSelectionWithStop,
  };
}
