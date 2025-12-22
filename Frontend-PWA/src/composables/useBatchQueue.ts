
import { ref, computed, onUnmounted } from 'vue'
import { useToast } from './useToast'
import { useModules } from './useModules'

interface BatchQueueOptions {
  throttleMs?: number
  baseScheme?: string
}

export function useBatchQueue(options: BatchQueueOptions = {}) {
  const { throttleMs = 750, baseScheme = 'clashroyale://playerInfo?id=' } = options
  
  const selectedIds = ref<string[]>([])
  const queue = ref<string[]>([]) // Legacy queue for non-blitz manual mode
  const lastActionTime = ref(0)
  
  // Blitz State
  const isBlasting = ref(false)
  const currentIndex = ref(0)
  let worker: Worker | null = null
  
  // Selection Mode State (Auto-derived or Forced)
  const forceSelectionMode = ref(false)

  const { error } = useToast()
  const { modules } = useModules()

  const isSelectionMode = computed(() => selectedIds.value.length > 0 || forceSelectionMode.value)
  const isProcessing = computed(() => queue.value.length > 0)

  // Returns props compatible with FabIsland
  const fabState = computed(() => {
    if (!isSelectionMode.value) return { visible: false }

    const total = selectedIds.value.length
    
    // Label Logic
    let label = 'Open'
    
    if (isBlasting.value) {
        // Blasting Mode: Show progress
        label = `${currentIndex.value + 1} / ${total}`
    } else if (total > 0) {
        // Manual Mode
        if (isProcessing.value) {
            const current = (total - queue.value.length) + 1
            label = `Next (${current}/${total})`
        } else {
            label = `Open (${total})`
        }
    } else {
        // Empty State (Forced Mode)
        label = 'Select'
    }

    // Target Logic (For href)
    const targetId = isBlasting.value 
        ? selectedIds.value[currentIndex.value] 
        : (isProcessing.value ? queue.value[0] : selectedIds.value[0])

    return {
      visible: true,
      label,
      // Dynamic HREF updates based on state
      actionHref: targetId ? `${baseScheme}${targetId}` : undefined,
      isProcessing: isProcessing.value,
      isBlasting: isBlasting.value,
      selectionCount: total,
      blitzEnabled: modules.value.blitzMode
    }
  })

  function toggleSelect(id: string) {
    // 🛡️ Guard: Prevent modifying selection while a batch run is in progress
    if (isProcessing.value || isBlasting.value) return

    const index = selectedIds.value.indexOf(id)
    if (index !== -1) {
      selectedIds.value.splice(index, 1)
    } else {
      selectedIds.value.push(id)
    }
  }

  function selectAll(ids: readonly string[]) {
    if (isProcessing.value || isBlasting.value) return 
    selectedIds.value = [...ids]
    queue.value = []
  }

  function clearSelection() {
    stopBlitz() // Emergency stop
    selectedIds.value = []
    queue.value = []
    forceSelectionMode.value = false // Reset sticky mode
  }
  
  function setForceSelectionMode(active: boolean) {
    forceSelectionMode.value = active
  }

  /**
   * 💉 DOM INJECTION: Anchor Click (Most robust for deep links)
   */
  function fireDeepLink(url: string) {
    const link = document.createElement('a')
    link.href = url
    link.style.display = 'none'
    link.rel = 'noopener noreferrer'
    document.body.appendChild(link)
    
    link.click()
    
    // Garbage collection
    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link)
      }
    }, 1500)
  }

  // --- WORKER LOGIC ---
  
  function createWorker(interval: number) {
    // Create a blob worker to run the timer off-thread.
    // This bypasses main-thread throttling when the tab is hidden.
    const blob = new Blob([`
      let timer = null;
      self.onmessage = function(e) {
        if (e.data === 'start') {
          if (timer) clearInterval(timer);
          timer = setInterval(() => self.postMessage('tick'), ${interval});
        } else if (e.data === 'stop') {
          clearInterval(timer);
          timer = null;
        }
      };
    `], { type: 'text/javascript' });
    return new Worker(URL.createObjectURL(blob));
  }

  function stopBlitz() {
    isBlasting.value = false
    currentIndex.value = 0
    if (worker) {
        worker.terminate()
        worker = null
    }
  }

  /**
   * Advances the state index.
   * Checks for completion.
   */
  function advanceIndex() {
    currentIndex.value++
    // End Condition
    if (currentIndex.value >= selectedIds.value.length) {
        setTimeout(() => {
            if (isBlasting.value) {
                stopBlitz()
                clearSelection()
            }
        }, 500)
        return false // Ended
    }
    return true // Continue
  }

  /**
   * 🤖 AUTO PULSE (Worker/Script Initiated)
   * This triggers the JS injection. This WILL cause prompts on strict browsers.
   */
  function nextPulseAutomated() {
    if (!isBlasting.value) return
    
    const id = selectedIds.value[currentIndex.value]
    if (id) {
        fireDeepLink(`${baseScheme}${id}`)
        advanceIndex()
    }
  }

  // ⚡ BLITZ MODE START
  function handleBlitz() {
    if (isBlasting.value || selectedIds.value.length === 0) return
    
    console.log("⚡ Starting Blitz Mode")
    
    isBlasting.value = true
    currentIndex.value = 0
    
    // 1. Fire first shot immediately
    nextPulseAutomated()
    
    // 2. Start Worker for rhythm
    worker = createWorker(throttleMs)
    worker.onmessage = () => {
        // This runs on a separate thread's tick
        nextPulseAutomated()
    }
    worker.postMessage('start')
  }

  // MAIN ACTION HANDLER
  function handleAction(e: MouseEvent) {
    // 1. BLITZ MODE (Manual Assist)
    if (isBlasting.value) {
        // Check if this was a native anchor click (from FabIsland)
        const isAnchor = (e.currentTarget as HTMLElement).tagName === 'A';

        if (isAnchor) {
            // ✅ NATIVE NAVIGATION:
            // The browser will handle opening the link because it's a real <a> tag with href.
            // This bypasses the popup prompt on most browsers.
            
            // We just need to update our internal state to the NEXT item
            // and reset the automation timer so it doesn't double-fire immediately.
            console.log("⚡ Manual Native Assist")
            advanceIndex()
            
            if (worker) {
                worker.postMessage('stop')
                worker.postMessage('start')
            }
            return // Let default action (navigation) proceed
        }

        // 🛑 LEGACY FALLBACK (Button click):
        e.preventDefault() 
        console.log("⚡ Manual Scripted Assist")
        nextPulseAutomated()
        
        if (worker) {
            worker.postMessage('stop')
            worker.postMessage('start')
        }
        return
    }

    // 2. STANDARD MODE (Legacy sequential)
    const now = Date.now()
    
    if (now - lastActionTime.value < throttleMs) {
      e.preventDefault() // Stop navigation if clicking too fast
      return
    }
    
    lastActionTime.value = now

    // Initialize Queue if starting fresh
    if (queue.value.length === 0) {
      queue.value = [...selectedIds.value]
    }

    // "Consume" the current item logic
    setTimeout(() => {
      if (queue.value.length > 0) {
        queue.value.shift()
      }
      
      // Auto-exit when done
      if (queue.value.length === 0) {
        selectedIds.value = []
      }
    }, 50)
  }

  onUnmounted(() => {
    stopBlitz()
  })

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
    setForceSelectionMode
  }
}
