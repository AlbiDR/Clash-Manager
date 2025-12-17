
import { ref, computed } from 'vue'
import { useToast } from './useToast'

interface BatchQueueOptions {
  throttleMs?: number
  baseScheme?: string
}

export function useBatchQueue(options: BatchQueueOptions = {}) {
  const { throttleMs = 750, baseScheme = 'clashroyale://playerInfo?id=' } = options
  
  const selectedIds = ref<string[]>([])
  const queue = ref<string[]>([])
  const lastActionTime = ref(0)
  const isBlasting = ref(false)
  const { error } = useToast()

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
      isProcessing: isProcessing.value,
      isBlasting: isBlasting.value,
      selectionCount: total
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
    // 🛡️ Guard: Prevent modifying selection while a batch run is in progress
    if (isProcessing.value || isBlasting.value) return 
    selectedIds.value = [...ids]
    queue.value = [] // Reset queue memory
  }

  function clearSelection() {
    if (isBlasting.value) return // Don't clear mid-blast
    selectedIds.value = []
    queue.value = []
  }

  function handleAction(e: MouseEvent) {
    // Don't interfere if blasting
    if (isBlasting.value) {
      e.preventDefault()
      return
    }

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

  // ⚡ BLITZ MODE: Automated Opener
  function handleBlitz() {
    if (isBlasting.value || selectedIds.value.length === 0) return
    
    // Warn user immediately
    console.log("⚡ Starting Blitz Mode. Ensure browser 'Pop-ups and redirects' are allowed.")
    
    isBlasting.value = true
    const targets = [...selectedIds.value]
    let index = 0
    let failureCount = 0

    const intervalId = setInterval(() => {
      // End condition
      if (index >= targets.length) {
        clearInterval(intervalId)
        isBlasting.value = false
        clearSelection()
        return
      }

      const id = targets[index]
      const url = `${baseScheme}${id}`
      
      // Attempt Open
      const win = window.open(url, '_blank')
      
      // 🛡️ Detection: If browser blocks popup, window.open *might* return null.
      // Note: This is not 100% reliable on mobile, but catches hard blocks.
      if (!win) {
        failureCount++
        if (failureCount > 2) {
          clearInterval(intervalId)
          isBlasting.value = false
          error('Pop-ups blocked! Please allow "Pop-ups and redirects" in Site Settings.')
          return
        }
      }

      index++
    }, 750) // 750ms Delay to ensure reliable loading
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
    handleBlitz
  }
}
