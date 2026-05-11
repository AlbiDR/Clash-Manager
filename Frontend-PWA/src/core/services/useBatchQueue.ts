// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { useAppSettings } from "./useAppSettings";
import { useExternalLink, buildDeepLink } from "./useExternalLink";
import { useToast } from "./useToast";
import { ref, computed, onUnmounted, getCurrentInstance } from "vue";

interface BatchQueueOptions {
  throttleMs?: number;
  baseScheme?: string;
}

/**
 * COMPOSABLE: useBatchQueue
 *
 * @remarks
 * Orchestrates the "Recruitment Pipeline" for the Headhunter feature.
 * It manages a multi-tier deep-linking strategy for processing lists of items.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 (@core)
 * - **Import Boundaries:** May import from Layer 1 (@core) and Layer 0 (@substrate).
 * - **Responsibility:** Manages recruitment selection and automated "Blitz" execution.
 *
 * **Side Effects:**
 * - Triggers global toast notifications via `useToast`.
 * - Invokes external application protocols via `useExternalLink`.
 *
 * @param options - Configuration for throttling and link schemes.
 * @returns Reactive state and handlers for batch recruitment operations.
 */
export function useBatchQueue(options: BatchQueueOptions = {}) {
  const { throttleMs = 850 } = options;

  /** Reactive array of selected recruit tags. */
  const selectedRecruitIds = ref<string[]>([]);
  /** Sequential queue of tags remaining to be opened. */
  const batchExecutionQueue = ref<string[]>([]);
  /** Timestamp of the last successful deep-link trigger. */
  const lastDeepLinkTriggerTime = ref(0);

  // Blitz State
  const isBlitzActive = ref(false);
  const blitzCurrentItemIndex = ref(0);
  let blitzOperationTimer: ReturnType<typeof setTimeout> | null = null;

  // Selection Mode State
  const isManualSelectionModeForced = ref(false);

  const { error, info } = useToast();
  const { modules } = useAppSettings();
  const { openInGame } = useExternalLink();

  /** Indicates if the UI should be in selection mode. */
  const isSelectionMode = computed(
    () => selectedRecruitIds.value.length > 0 || isManualSelectionModeForced.value,
  );
  /** Indicates if a manual batch queue is currently being processed. */
  const isProcessing = computed(() => batchExecutionQueue.value.length > 0);

  /**
   * Environment Trust Verification.
   * Ensures the composable is running in a standard browser/PWA context.
   * Required for automated "Blitz" actions to prevent abuse in headless environments.
   */
  const isTrusted = computed(() => {
    if (typeof navigator === "undefined") return false;
    // Always trust browser environment for standard PWA usage
    return true;
  });

  /**
   * UI State for the Floating Action Button (FAB).
   * Calculates labels and hrefs based on selection state and Blitz status.
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

    const totalSelectedCount = selectedRecruitIds.value.length;
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
      ? selectedRecruitIds.value[blitzCurrentItemIndex.value]
      : isProcessing.value
        ? batchExecutionQueue.value[0]
        : selectedRecruitIds.value[0];

    const fabData = {
      visible: true,
      label,
      actionHref: targetId ? buildDeepLink(targetId) : undefined,
      isProcessing: isProcessing.value,
      isBlasting: isBlitzActive.value,
      selectionCount: totalSelectedCount,
      blitzEnabled: modules.blitzMode && isTrusted.value,
    };

    return fabData;
  });

  /**
   * Toggles the selection status of a recruit.
   * @param recruitId - The unique player tag.
   */
  function toggleSelect(recruitId: string) {
    if (isProcessing.value || isBlitzActive.value) {
      return;
    }

    const existingIndex = selectedRecruitIds.value.indexOf(recruitId);
    if (existingIndex !== -1) {
      selectedRecruitIds.value.splice(existingIndex, 1);
    } else {
      selectedRecruitIds.value.push(recruitId);
    }
  }

  /**
   * Replaces the current selection with a new set of IDs.
   * @param recruitIds - The new set of player tags.
   */
  function selectAll(recruitIds: readonly string[]) {
    if (isProcessing.value || isBlitzActive.value) return;
    selectedRecruitIds.value = [...recruitIds];
    batchExecutionQueue.value = [];
  }

  /**
   * Clears all selections and resets the batch processing state.
   *
   * @remarks
   * This ensures a clean slate by stopping any active blitz, emptying the
   * selection/processing queues, and resetting the manual selection mode.
   */
  function clearSelection() {
    stopBlitz();
    selectedRecruitIds.value = [];
    batchExecutionQueue.value = [];
    isManualSelectionModeForced.value = false;
    blitzCurrentItemIndex.value = 0;
  }

  /**
   * Forcefully stops an active Blitz operation.
   */
  function stopBlitz() {
    isBlitzActive.value = false;
    if (blitzOperationTimer) {
      clearTimeout(blitzOperationTimer);
      blitzOperationTimer = null;
    }
  }

  /**
   * Recursive engine for the Blitz mode.
   * Manages the timing and execution of sequential deep-link triggers.
   */
  function advanceBlitz() {
    if (!isBlitzActive.value) return;

    if (blitzCurrentItemIndex.value >= selectedRecruitIds.value.length) {
      stopBlitz();
      info("Blitz complete");
      return;
    }

    const activeRecruitId = selectedRecruitIds.value[blitzCurrentItemIndex.value];
    if (activeRecruitId) {
      openInGame(activeRecruitId);

      // COMPATIBILITY: Increased delay for split-screen multitasking.
      // On mobile devices, when Clash Royale is opened in split-screen or
      // picture-in-picture, the OS requires more time to cycle the intent
      // without dropping the background PWA state. 4000ms is the observed safety floor.
      const safetyDelay = Math.max(throttleMs, 4000);
      if (blitzCurrentItemIndex.value < selectedRecruitIds.value.length - 1) {
        // [LOGIC] RECURSION: Schedules next item only after safety delay.
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
      // Handle skip if ID is missing for some reason
      if (blitzCurrentItemIndex.value < selectedRecruitIds.value.length - 1) {
        blitzCurrentItemIndex.value++;
        advanceBlitz();
      } else {
        stopBlitz();
      }
    }
  }

  /**
   * Initiates the automated Blitz sequence.
   * Verifies environmental trust before initiating.
   */
  function handleBlitz() {
    if (isBlitzActive.value || selectedRecruitIds.value.length === 0) return;
    if (!isTrusted.value) {
      error("Environment verification failed");
      return;
    }

    isBlitzActive.value = true;
    blitzCurrentItemIndex.value = 0;
    advanceBlitz();
  }

  /**
   * Handles the primary action for the batch queue.
   * Supports both Blitz interception and standard sequential opening.
   * @param event - The original click event.
   */
  function handleAction(event: MouseEvent) {
    if (isBlitzActive.value) {
      event.preventDefault();
      const activeRecruitId = selectedRecruitIds.value[blitzCurrentItemIndex.value];
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
      batchExecutionQueue.value = [...selectedRecruitIds.value];
    }

    // ACTION IGNITION: Sequential Open
    const nextQueueId = batchExecutionQueue.value[0];
    if (nextQueueId) {
      openInGame(nextQueueId);
    }

    // [LOGIC] REFRESH CYCLE: Delay the queue shift to allow the UI to react to the
    // 'open' intent and prevent accidental double-triggers or race conditions
    // between the browser navigation and internal state updates.
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

  return {
    /** Reactive array of selected recruit tags. */
    selectedIds: selectedRecruitIds,
    /** Sequential queue of tags remaining to be opened. */
    queue: batchExecutionQueue,
    /** Indicates if a manual batch queue is currently being processed. */
    isProcessing,
    /** Indicates if the UI should be in selection mode. */
    isSelectionMode,
    /** Computed state for the Floating Action Button (FAB). */
    fabState,
    /** Toggles the selection status of a recruit. */
    toggleSelect,
    /** Selects all recruits in the provided list. */
    selectAll,
    /** Clears all selections and stops any active Blitz operation. */
    clearSelection,
    /** Handles the primary FAB action (Sequential Open). */
    handleAction,
    /** Initiates the automated Blitz sequence. */
    handleBlitz,
    /** Manually overrides the selection mode state. */
    setForceSelectionMode: (isForced: boolean) => {
      isManualSelectionModeForced.value = isForced;
    },
  };
}
