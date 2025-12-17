
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useToast } from './useToast'
import { useModules } from './useModules'

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
  const { modules } = useModules()

  // Track the current index for the resurrection logic
  let currentIndex = 0
  let timerId: any = null

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

  /**
   * ⚓ ANCHOR INJECTION ENGINE (Solution Alpha V2)
   * Creates a hidden anchor tag and clicks it programmatically.
   * This is treated as a "navigation" by mobile browsers and is less likely
   * to be blocked than an iframe load for deep links.
   */
  function fireDeepLink(url: string) {
    const link = document.createElement('a')
    link.href = url
    link.style.display = 'none'
    // 'noopener' prevents the new window from controlling this one
    // 'noreferrer' prevents sending referer headers
    link.rel = 'noopener noreferrer' 
    document.body.appendChild(link)
    
    link.click()
    
    // Garbage collection
    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link)
      }
    }, 1000)
  }

  // Recursive execution loop
  const next = () => {
    // Stop condition
    if (currentIndex >= selectedIds.value.length || !isBlasting.value) {
      isBlasting.value = false
      clearSelection()
      return
    }

    const id = selectedIds.value[currentIndex]
    const url = `${baseScheme}${id}`
    
    try {
      fireDeepLink(url)
    } catch (e) {
      console.error("Deep link failed", e)
    }

    currentIndex++
    
    // Schedule next shot
    if (timerId) clearTimeout(timerId)
    timerId = setTimeout(next, throttleMs)
  }

  // ⚡ BLITZ MODE: Automated Opener
  function handleBlitz() {
    if (isBlasting.value || selectedIds.value.length === 0) return
    
    console.log("⚡ Starting Blitz Mode (Anchor Injection Protocol)")
    
    isBlasting.value = true
    currentIndex = 0
    
    // Fire first shot immediately
    next()
  }

  // 🧟 RESURRECTION LOGIC
  // If the user switches apps (Browser -> Clash Royale), the browser might
  // freeze the JS timer. When they switch back to the Browser, this detects
  // the visibility change and immediately fires the next link if one was pending.
  function handleVisibilityChange() {
    if (document.visibilityState === 'visible' && isBlasting.value) {
      console.log("👁️ App foregrounded - Resurrecting Blitz Queue")
      if (timerId) clearTimeout(timerId)
      // Small delay to allow browser to "settle" from background state
      timerId = setTimeout(next, 200)
    }
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange)
  })

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    if (timerId) clearTimeout(timerId)
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
    handleBlitz
  }
}

