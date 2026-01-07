// @ts-nocheck
import { ref, computed, onUnmounted, getCurrentInstance } from "vue";
import { useToast } from "./useToast";
import { useModules } from "./useModules";

interface BatchQueueOptions {
  throttleMs?: number;
  baseScheme?: string;
}

export function useBatchQueue(options: BatchQueueOptions = {}) {
  const { throttleMs = 750, baseScheme = "clashroyale://playerInfo?id=" } =
    options;

  const selectedIds = ref<string[]>([]);
  const queue = ref<string[]>([]); // Legacy queue for non-blitz manual mode
  const lastActionTime = ref(0);

  // Blitz State
  const isBlasting = ref(false);
  const currentIndex = ref(0);
  let worker: Worker | null = null;

  // Selection Mode State (Auto-derived or Forced)
  const forceSelectionMode = ref(false);

  const { error, info } = useToast();
  const { modules } = useModules();

  const isSelectionMode = computed(
    () => selectedIds.value.length > 0 || forceSelectionMode.value,
  );
  const isProcessing = computed(() => queue.value.length > 0);

  // Returns props compatible with FabIsland
  const fabState = computed(() => {
    if (!isSelectionMode.value) return { visible: false };

    const total = selectedIds.value.length;

    // Label Logic
    let label = "Open";

    if (isBlasting.value) {
      // Blasting Mode: Show progress
      label = `${currentIndex.value + 1} / ${total}`;
    } else if (total > 0) {
      // Manual Mode
      if (isProcessing.value) {
        const current = total - queue.value.length + 1;
        label = `Next (${current}/${total})`;
      } else {
        label = `Open (${total})`;
      }
    } else {
      // Empty State (Forced Mode)
      label = "Select";
    }

    // Target Logic (For href)
    const targetId = isBlasting.value
      ? selectedIds.value[currentIndex.value]
      : isProcessing.value
        ? queue.value[0]
        : selectedIds.value[0];

    return {
      visible: true,
      label,
      // Dynamic HREF updates based on state
      actionHref: targetId ? `${baseScheme}${targetId}` : undefined,
      isProcessing: isProcessing.value,
      isBlasting: isBlasting.value,
      selectionCount: total,
      blitzEnabled: modules.value.blitzMode,
    };
  });

  function toggleSelect(id: string) {
    // 🛡️ Guard: Prevent modifying selection while a batch run is in progress
    if (isProcessing.value || isBlasting.value) return;

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

  function clearSelection() {
    stopBlitz(); // Emergency stop
    selectedIds.value = [];
    queue.value = [];
    forceSelectionMode.value = false; // Reset sticky mode
  }

  function setForceSelectionMode(active: boolean) {
    forceSelectionMode.value = active;
  }

  /**
   * 💉 DEEP LINK IGNITION
   */
  function fireDeepLink(url: string) {
    // For Blitz mode/background automation, window.open is often more permissive 
    // on some Android browser implementations than anchor clicks.
    if (isBlasting.value) {
      const win = window.open(url, "_blank");
      if (win) {
        setTimeout(() => win.close(), 100);
        return;
      }
    }

    // Default: Native anchor click (Best for manual interaction)
    const link = document.createElement("a");
    link.href = url;
    link.style.display = "none";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
    }, 1500);
  }

  let blitzTimer: any = null;

  function stopBlitz() {
    console.log("⚡ Stopping Blitz Mode");
    isBlasting.value = false;
    if (blitzTimer) {
      clearTimeout(blitzTimer);
      blitzTimer = null;
    }
    if (worker) {
      worker.terminate();
      worker = null;
    }
  }

  function advanceBlitz() {
    if (!isBlasting.value) return;

    // 1. Check bounds
    if (currentIndex.value >= selectedIds.value.length) {
      setTimeout(() => {
        stopBlitz();
        clearSelection();
        info("Blitz complete");
      }, 500);
      return;
    }

    // 2. Fire current item
    const id = selectedIds.value[currentIndex.value];
    if (id) {
      fireDeepLink(`${baseScheme}${id}`);
      
      // 3. Schedule next pulse if not finished
      const delay = Math.max(throttleMs, 2500);
      if (currentIndex.value < selectedIds.value.length - 1) {
        blitzTimer = setTimeout(() => {
          currentIndex.value++; // Increment ONLY when we are ready for the next one
          advanceBlitz();
        }, delay);
      } else {
        // Last one reached
        setTimeout(() => {
          stopBlitz();
          clearSelection();
          info("Blitz complete");
        }, 1500);
      }
    } else {
      // Logic for handling null/missing items
      if (currentIndex.value < selectedIds.value.length - 1) {
        currentIndex.value++;
        advanceBlitz();
      } else {
        stopBlitz();
        clearSelection();
      }
    }
  }

  /**
   * Advances the state index.
   * Checks for completion.
   */
  function advanceIndex() {
    currentIndex.value++;
    // End Condition
    if (currentIndex.value >= selectedIds.value.length) {
      setTimeout(() => {
        if (isBlasting.value) {
          stopBlitz();
          info("Batch sequence complete");
        }
      }, 500);
      return false; // Ended
    }
    return true; // Continue
  }


  // ⚡ BLITZ MODE START
  function handleBlitz() {
    if (isBlasting.value || selectedIds.value.length === 0) return;

    console.log("⚡ Initiating Blitz Mode");
    isBlasting.value = true;
    currentIndex.value = 0;

    // Start the recursive loop
    advanceBlitz();
  }

  // MAIN ACTION HANDLER
  function handleAction(e: MouseEvent) {
    // 1. BLITZ MODE (Manual Assist)
    if (isBlasting.value) {
      // Manual click in Blitz mode acts as an emergency "Manual fire + Skip"
      e.preventDefault();
      
      console.log("⚡ Manual Assist Click");
      const id = selectedIds.value[currentIndex.value];
      if (id) {
        // Direct anchor click (most reliable for manual gesture)
        const link = document.createElement("a");
        link.href = `${baseScheme}${id}`;
        link.click();
        
        currentIndex.value++;

        // Reset the timer to prevent double-firing immediately after manual assist
        if (blitzTimer) {
          clearTimeout(blitzTimer);
          const delay = Math.max(throttleMs, 2500);
          blitzTimer = setTimeout(advanceBlitz, delay);
        }
      }
      return;
    }

    // 2. STANDARD MODE (Legacy sequential)
    const now = Date.now();

    if (now - lastActionTime.value < throttleMs) {
      e.preventDefault(); // Stop navigation if clicking too fast
      return;
    }

    lastActionTime.value = now;

    // Initialize Queue if starting fresh
    if (queue.value.length === 0) {
      queue.value = [...selectedIds.value];
    }

    // "Consume" the current item logic
    setTimeout(() => {
      if (queue.value.length > 0) {
        queue.value.shift();
      }

      // Auto-exit when done
      if (queue.value.length === 0) {
        // Completed processing: clear selection and reset modes.
        clearSelection();
        info("Batch complete");
      }
    }, 50);
  }

  if (getCurrentInstance()) {
    onUnmounted(() => {
      stopBlitz();
    });
  }

  return {
    selectedIds,
    queue,
    isProcessing,
    isSelectionMode,
    fabState,
    toggleSelect,
    selectAll,
    clearSelection,
    handleAction,
    handleBlitz,
    setForceSelectionMode,
  };
}
