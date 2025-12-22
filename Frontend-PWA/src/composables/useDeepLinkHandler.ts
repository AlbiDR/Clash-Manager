import { ref, nextTick } from 'vue'
import { useRoute } from 'vue-router'

export function useDeepLinkHandler(domIdPrefix: string) {
  const route = useRoute()
  const expandedIds = ref<Set<string>>(new Set())
  
  // Stability: Prevent re-triggering scroll on background data refreshes
  const deepLinkHandled = ref(false)

  function toggleExpand(id: string) {
    const newSet = new Set(expandedIds.value)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    expandedIds.value = newSet
  }

  function processDeepLink(items: readonly { id: string }[]) {
    // Only run once per session/reload to avoid jarring resets
    if (deepLinkHandled.value) return

    const pinId = route.query.pin as string
    
    // Check if the pinned ID exists in the current dataset
    if (pinId && items.some(item => item.id === pinId)) {
      const newSet = new Set(expandedIds.value)
      newSet.add(pinId)
      expandedIds.value = newSet
      
      deepLinkHandled.value = true // Mark handled
      
      nextTick(() => {
        const el = document.getElementById(`${domIdPrefix}${pinId}`)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    }
  }

  return {
    expandedIds,
    toggleExpand,
    processDeepLink
  }
}
