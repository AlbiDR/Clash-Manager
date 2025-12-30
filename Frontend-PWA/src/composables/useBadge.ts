// @ts-nocheck
import { ref } from 'vue'

export function useBadge() {
  // Check multiple badge API support levels
  const hasStandardBadge = typeof navigator !== 'undefined' && 'setAppBadge' in navigator
  const hasExperimentalBadge = typeof navigator !== 'undefined' && 'setExperimentalAppBadge' in navigator
  const hasServiceWorker = typeof navigator !== 'undefined' && 'serviceWorker' in navigator

  const isSupported = hasStandardBadge || hasExperimentalBadge || hasServiceWorker

  async function setBadge(count: number) {
    if (!isSupported) {
      console.warn('[Badge] No badge API available')
      return
    }

    try {
      // Layer 1: Standard Badge API (Chrome, Edge, Samsung Internet)
      if (hasStandardBadge) {
        if (count > 0) {
          await (navigator as any).setAppBadge(count)
        } else {
          await (navigator as any).clearAppBadge()
        }
        console.log(`[Badge] Set via standard API: ${count}`)
        return
      }

      // Layer 2: Experimental Badge API (older browsers)
      if (hasExperimentalBadge) {
        if (count > 0) {
          await (navigator as any).setExperimentalAppBadge(count)
        } else {
          await (navigator as any).clearExperimentalAppBadge()
        }
        console.log(`[Badge] Set via experimental API: ${count}`)
        return
      }

      // Layer 3: Service Worker Badge (mobile PWAs, iOS fallback)
      if (hasServiceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SET_BADGE',
          count: count > 0 ? count : 0
        })
        console.log(`[Badge] Set via Service Worker: ${count}`)
        return
      }

      // Layer 4: Service Worker not ready, queue for later
      if (hasServiceWorker) {
        navigator.serviceWorker.ready.then(registration => {
          if (registration.active) {
            registration.active.postMessage({
              type: 'SET_BADGE',
              count: count > 0 ? count : 0
            })
            console.log(`[Badge] Set via ready Service Worker: ${count}`)
          }
        })
      }
    } catch (e) {
      console.error('[Badge] Failed to update app badge:', e)
    }
  }

  async function clearBadge() {
    await setBadge(0)
  }

  return {
    isSupported,
    setBadge,
    clearBadge
  }
}
