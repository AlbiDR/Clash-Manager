import { ref, computed, onUnmounted, getCurrentInstance } from "vue";
import { useToast } from "./useToast";
import { useModules } from "./useModules";

interface BatchQueueOptions {
  throttleMs?: number;
  baseScheme?: string;
}

/**
 * ⚡ USE BATCH QUEUE
 * Manages sequential or automated deep-linking to the host application.
 * Memory safety: Ensures iframe and timer cleanup on unmount.
 */
export function useBatchQueue(options: BatchQueueOptions = {}) {
  const { throttleMs = 850, baseScheme = "clashroyale://playerInfo?id=" } = options;

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
  const { modules } = useModules();

  const isSelectionMode = computed(
    () => selectedIds.value.length > 0 || forceSelectionMode.value,
  );
  const isProcessing = computed(() => queue.value.length > 0);

  const isTrusted = computed(() => {
    if (typeof navigator === "undefined") return false;
    
    // ⚡ Android Reliability: If we're on Android, we trust the intent system 
    // to handle the fallback if NOT in TWA. This prevents the FAB from disappearing 
    // when TWA signal is not detected but the user still wants to open players.
    if (/android/i.test(navigator.userAgent)) return true;
    
    // Desktop/Dev is always trusted
    return true;
  });

  const fabState = computed(() => {
    console.log('[useBatchQueue] fabState recompute:', {
      isSelectionMode: isSelectionMode.value,
      selectedCount: selectedIds.value.length,
      selectedIds: selectedIds.value,
      forceSelectionMode: forceSelectionMode.value
    });
    
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
        label = `Next (${current}/${total})`;
      } else {
        label = `Open (${total})`;
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
      actionHref: targetId ? `${baseScheme}${targetId}` : undefined,
      isProcessing: isProcessing.value,
      isBlasting: isBlasting.value,
      selectionCount: total,
      blitzEnabled: modules.blitzMode && isTrusted.value,
    };
    
    // console.log('[useBatchQueue] FAB visible:', fabData);
    return fabData;
  });

  function toggleSelect(id: string) {
    // console.log('[useBatchQueue] toggleSelect called:', { id });
    
    if (isProcessing.value || isBlasting.value) {
      console.log('[useBatchQueue] toggleSelect blocked - processing or blasting');
      return;
    }
    
    const index = selectedIds.value.indexOf(id);
    if (index !== -1) {
      selectedIds.value.splice(index, 1);
      console.log('[useBatchQueue] Deselected:', id, 'Remaining:', selectedIds.value);
    } else {
      selectedIds.value.push(id);
      console.log('[useBatchQueue] Selected:', id, 'Total:', selectedIds.value);
    }
  }

  function selectAll(ids: readonly string[]) {
    if (isProcessing.value || isBlasting.value) return;
    selectedIds.value = [...ids];
    queue.value = [];
  }

  function clearSelection() {
    stopBlitz();
    selectedIds.value = [];
    queue.value = [];
    forceSelectionMode.value = false;
  }

  /**
   * 💉 DEEP LINK IGNITION
   */
  let iframe: HTMLIFrameElement | null = null;
  
  function getIframe() {
    if (iframe) return iframe;
    iframe = document.createElement("iframe");
    iframe.style.display = "none";
    document.body.appendChild(iframe);
    return iframe;
  }

  function fireDeepLink(url: string) {
    const userAgent = navigator.userAgent;
    const isAndroid = /android/i.test(userAgent);
    const isTauri = typeof window.__TAURI__ !== 'undefined';
    
    if (isAndroid) {
      // Extract player ID from clashroyale://playerInfo?id=XXXXXX
      const match = url.match(/id=([A-Z0-9]+)/);
      if (match && match[1]) {
        const playerId = match[1];
        
        // Android Intent URI that will open Clash Royale app
        // If app not installed, falls back to Play Store
        const intentUrl = `intent://playerInfo?id=${playerId}#Intent;` +
          `scheme=clashroyale;` +
          `package=com.supercell.clashroyale;` +
          `S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.supercell.clashroyale;` +
          `end`;
        
        // In Tauri, we can directly navigate to the Intent URL
        // The Android WebView will handle it properly
        if (isTauri) {
          window.location.href = intentUrl;
          return;
        }
        
        // Fallback: use iframe for browser/PWA
        getIframe().src = intentUrl;
        return;
      }
    }

    // Fallback for non-Android or malformed URLs
    const link = document.createElement("a");
    link.href = url;
    link.style.display = "none";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      if (link.parentNode) link.parentNode.removeChild(link);
    }, 1000);
  }

  function stopBlitz() {
    isBlasting.value = false;
    if (blitzTimer) {
      clearTimeout(blitzTimer);
      blitzTimer = null;
    }
  }

  function advanceBlitz() {
    if (!isBlasting.value) return;

    if (currentIndex.value >= selectedIds.value.length) {
      stopBlitz();
      info("Blitz complete");
      return;
    }

    const id = selectedIds.value[currentIndex.value];
    if (id) {
      fireDeepLink(`${baseScheme}${id}`, true);
      
      const delay = Math.max(throttleMs, 2000);
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

  function handleBlitz() {
    if (isBlasting.value || selectedIds.value.length === 0) return;
    if (!isTrusted.value) {
      error("TWA verification failed");
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
        fireDeepLink(`${baseScheme}${id}`, false);
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
      // Cleanup Memory (Bug #8)
      if (iframe && iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
        iframe = null;
      }
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
    setForceSelectionMode: (val: boolean) => { forceSelectionMode.value = val; },
  };
}

