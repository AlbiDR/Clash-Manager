import { ref, computed } from 'vue'

interface BatchQueueOptions {
  throttleMs?: number
  baseScheme?: string
}

export function useBatchQueue(options: BatchQueueOptions = {}) {
  const { throttleMs = 750, baseScheme = 'clashroyale://playerInfo?id=' } = options
  
  const selectedIds = ref<string[]>([])
  const queue = ref<string[]>([])
  const lastActionTime = ref(0)

  const isSelectionMode = computed(() => selectedIds.value.length > 0)
  const isProcessing = computed(() => queue.value.length > 0)

  // Returns props compatible with FabIsland
  const fabState = computed(() => {
    if (!isSelectionMode.value) return { visible: false }

    // Target the first item in the active queue, or the first selected item
    const targetId = isProcessing.value ? queue.value[0] : selectedIds.value[0]
    const total = selectedIds.value.length
    
    let label = 'Open'
    if (total > 0) {
      if (isProcessing.value) {
        // Calculate current position: (Total - Remaining) + 1
        const current = (total - queue.value.length) + 1
        label = `Next (${current}/${total})`
      } else {
        label = `Open (${total})`
      }
    }

    return {
      visible: true,
      label,
      // Dynamic HREF updates based on state
      actionHref: targetId ? `${baseScheme}${targetId}` : undefined,
      isProcessing: isProcessing.value
    }
  })

  function toggleSelect(id: string) {
    // 🛡️ Guard: Prevent modifying selection while a batch run is in progress
    if (isProcessing.value) return

    const index = selectedIds.value.indexOf(id)
    if (index !== -1) {
      selectedIds.value.splice(index, 1)
    } else {
      selectedIds.value.push(id)
    }
  }

  function selectAll(ids: string[]) {
    // 🛡️ Guard: Prevent modifying selection while a batch run is in progress
    if (isProcessing.value) return 
    selectedIds.value = [...ids]
    queue.value = [] // Reset queue memory
  }

  function clearSelection() {
    selectedIds.value = []
    queue.value = []
  }

  function handleAction(e: MouseEvent) {
    const now = Date.now()
    
    // 🛡️ Robustness: Throttle
    // Prevents game profile corruption from spam-clicking
    if (now - lastActionTime.value < throttleMs) {
      e.preventDefault() // Stop navigation
      return
    }
    
    lastActionTime.value = now

    // Initialize Queue if starting fresh
    if (queue.value.length === 0) {
      queue.value = [...selectedIds.value]
    }

    // "Consume" the current item logic
    // Using setTimeout to allow the browser to process the link click event 
    // before we mutate the state that drives the href.
    setTimeout(() => {
      if (queue.value.length > 0) {
        queue.value.shift()
      }
      
      // Auto-exit when done
      if (queue.value.length === 0) {
        clearSelection()
      }
    }, 50)
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
    handleAction
  }
}
