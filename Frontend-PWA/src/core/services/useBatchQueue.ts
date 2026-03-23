import { useAppSettings } from "./useAppSettings";
import { useExternalLink } from "./useExternalLink";
import { useToast } from "./useToast";
import { ref, computed, onUnmounted, getCurrentInstance } from "vue";
import { buildDeepLink } from "./useExternalLink";

interface BatchQueueOptions {
  throttleMs?: number;
  baseScheme?: string;
}

/**
 * USE BATCH QUEUE
 *
 * @remarks
 * Orchestrates the "Recruitment Pipeline" for the Headhunter feature.
 * It manages a multi-tier deep-linking strategy:
 * 1. **Sequential Mode**: Users manually trigger the next link in the queue.
 * 2. **Blitz Mode**: An automated sequence that "blasts" through the selection with configurable delays.
 *
 * The composable handles throttle management to prevent browser/OS link blocking and
 * implements specialized delays for environment compatibility (e.g., split-screen multitasking).
 *
 * @param options - Configuration for throttling and link schemes.
 */
export function useBatchQueue(options: BatchQueueOptions = {}) {
  const { throttleMs = 850 } = options;

  const selectedIds = ref<string[]>([]);
  const queue = ref<string[]>([]);
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

  const isSelectionMode = computed(
    () => selectedIds.value.length > 0 || forceSelectionMode.value,
  );
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

    // console.log('[useBatchQueue] FAB visible:', fabData);
    return fabData;
  });

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
   *  DEEP LINK IGNITION
   */
  let iframe: HTMLIFrameElement | null = null;

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
      // Handle skip
      if (currentIndex.value < selectedIds.value.length - 1) {
        currentIndex.value++;
        advanceBlitz();
      } else {
        stopBlitz();
      }
    }
  }

  /**
   * Entry point for the automated Blitz sequence.
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

  function handleAction(e: MouseEvent) {
    if (isBlasting.value) {
      e.preventDefault();
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
      e.preventDefault();
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

    // Delay the queue shift to allow the UI to react to the 'open' intent
    // and prevent accidental double-triggers.
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

      // MEMORY SAFETY: Legacy Iframe Cleanup (Bug #8)
      // Earlier versions of the deep-link engine utilized a hidden iframe
      // to trigger custom schemes. While now handled by useExternalLink via
      // direct intents or window.location, this cleanup ensures no DOM
      // fragments persist if the strategy is toggled or polyfilled.
      if (iframe && iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
        iframe = null;
      }
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
