
import { ref } from 'vue'

export function useBadge() {
  const isSupported = typeof navigator !== 'undefined' && 'setAppBadge' in navigator

  async function setBadge(count: number) {
    if (!isSupported) return
    try {
      if (count > 0) {
        await (navigator as any).setAppBadge(count)
      } else {
        await (navigator as any).clearAppBadge()
      }
    } catch (e) {
      console.error('Failed to update app badge:', e)
    }
  }

  async function clearBadge() {
    if (!isSupported) return
    try {
      await (navigator as any).clearAppBadge()
    } catch (e) {
      console.error('Failed to clear app badge:', e)
    }
  }

  return {
    isSupported,
    setBadge,
    clearBadge
  }
}
