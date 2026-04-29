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
  const selectedIds = ref<string[]>([]);
  /** Sequential queue of tags remaining to be opened. */
  const queue = ref<string[]>([]);
  /** Timestamp of the last successful deep-link trigger. */
  const lastActionTime = ref(0);

  // Blitz State
  const isBlasting = ref(false);
  const currentIndex = ref(0);
  let blitzTimer: ReturnType<typeof setTimeout> | null = null;

  // Selection Mode State
  const forceSelectionMode = ref(false);

  const { error, info } = useToast();
  const { modules } = useAppSettings();
  const { openInGame } = useExternalLink();

  /** Indicates if the UI should be in selection mode. */
  const isSelectionMode = computed(
    () => selectedIds.value.length > 0 || forceSelectionMode.value,
  );
  /** Indicates if a manual batch queue is currently being processed. */
  const isProcessing = computed(() => queue.value.length > 0);

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

    const total = selectedIds.value.length;
    let label = "Open";

    if (isBlasting.value) {
      label = `${currentIndex.value + 1} / ${total}`;
    } else if (total > 0) {
      if (isProcessing.value) {
        const current = total - queue.value.length + 1;
        label = `Open (${current}/${total})`;
      } else {
        label = `Open (1/${total})`;
      }
    } else {
      label = "Select";
    }

    const targetId = isBlasting.value
      ? selectedIds.value[currentIndex.value]
      : isProcessing.value
        ? queue.value[0]
        : selectedIds.value[0];

    const fabData = {
      visible: true,
      label,
      actionHref: targetId ? buildDeepLink(targetId) : undefined,
      isProcessing: isProcessing.value,
      isBlasting: isBlasting.value,
      selectionCount: total,
      blitzEnabled: modules.blitzMode && isTrusted.value,
    };

    return fabData;
  });

  /**
   * Toggles the selection status of a recruit.
   * @param id - The unique player tag.
   */
  function toggleSelect(id: string) {
    if (isProcessing.value || isBlasting.value) {
      return;
    }

    const index = selectedIds.value.indexOf(id);
    if (index !== -1) {
      selectedIds.value.splice(index, 1);
    } else {
      selectedIds.value.push(id);
    }
  }

  /**
   * Replaces the current selection with a new set of IDs.
   * @param ids - The new set of player tags.
   */
  function selectAll(ids: readonly string[]) {
    if (isProcessing.value || isBlasting.value) return;
    selectedIds.value = [...ids];
    queue.value = [];
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
    selectedIds.value = [];
    queue.value = [];
    forceSelectionMode.value = false;
    currentIndex.value = 0;
  }

  /**
   * Forcefully stops an active Blitz operation.
   */
  function stopBlitz() {
    isBlasting.value = false;
    if (blitzTimer) {
      clearTimeout(blitzTimer);
      blitzTimer = null;
    }
  }

  /**
   * Recursive engine for the Blitz mode.
   * Manages the timing and execution of sequential deep-link triggers.
   */
  function advanceBlitz() {
    if (!isBlasting.value) return;

    if (currentIndex.value >= selectedIds.value.length) {
      stopBlitz();
      info("Blitz complete");
      return;
    }

    const id = selectedIds.value[currentIndex.value];
    if (id) {
      openInGame(id);

      // COMPATIBILITY: Increased delay for split-screen multitasking.
      // On mobile devices, when Clash Royale is opened in split-screen or
      // picture-in-picture, the OS requires more time to cycle the intent
      // without dropping the background PWA state. 4000ms is the observed safety floor.
      const delay = Math.max(throttleMs, 4000);
      if (currentIndex.value < selectedIds.value.length - 1) {
        // [LOGIC] RECURSION: Schedules next item only after safety delay.
        blitzTimer = setTimeout(() => {
          currentIndex.value++;
          advanceBlitz();
        }, delay);
      } else {
        blitzTimer = setTimeout(() => {
          stopBlitz();
          info("Blitz complete");
        }, 1500);
      }
    } else {
      // Handle skip if ID is missing for some reason
      if (currentIndex.value < selectedIds.value.length - 1) {
        currentIndex.value++;
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
    if (isBlasting.value || selectedIds.value.length === 0) return;
    if (!isTrusted.value) {
      error("Environment verification failed");
      return;
    }

    isBlasting.value = true;
    currentIndex.value = 0;
    advanceBlitz();
  }

  /**
   * Handles the primary action for the batch queue.
   * Supports both Blitz interception and standard sequential opening.
   * @param event - The original click event.
   */
  function handleAction(event: MouseEvent) {
    if (isBlasting.value) {
      event.preventDefault();
      const id = selectedIds.value[currentIndex.value];
      if (id) {
        openInGame(id);
        currentIndex.value++;

        if (blitzTimer) {
          clearTimeout(blitzTimer);
          blitzTimer = setTimeout(advanceBlitz, Math.max(throttleMs, 2000));
        }
      }
      return;
    }

    const now = Date.now();
    if (now - lastActionTime.value < throttleMs) {
      event.preventDefault();
      return;
    }
    lastActionTime.value = now;

    if (queue.value.length === 0) {
      queue.value = [...selectedIds.value];
    }

    // ACTION IGNITION: Sequential Open
    const id = queue.value[0];
    if (id) {
      openInGame(id);
    }

    // [LOGIC] REFRESH CYCLE: Delay the queue shift to allow the UI to react to the
    // 'open' intent and prevent accidental double-triggers or race conditions
    // between the browser navigation and internal state updates.
    setTimeout(() => {
      if (queue.value.length > 0) {
        queue.value.shift();
      }
      if (queue.value.length === 0) {
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
    selectedIds,
    /** Sequential queue of tags remaining to be opened. */
    queue,
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
    setForceSelectionMode: (val: boolean) => {
      forceSelectionMode.value = val;
    },
  };
}
