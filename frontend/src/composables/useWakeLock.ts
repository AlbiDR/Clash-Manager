
import { ref } from 'vue'

// Singleton State
const isSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator
const isActive = ref(false)
// Track user intent to persist lock across visibility changes. Default to TRUE.
let shouldBeActive = true 
let wakeLockSentinel: WakeLockSentinel | null = null

async function request() {
  if (!isSupported) return
  try {
    wakeLockSentinel = await navigator.wakeLock.request('screen')
    isActive.value = true
    shouldBeActive = true
    
    wakeLockSentinel.addEventListener('release', () => {
      // If released by system (tab hidden, low battery), isActive becomes false visually.
      // We rely on visibilitychange listener to re-acquire if shouldBeActive is true.
      if (wakeLockSentinel !== null) {
          isActive.value = false
          wakeLockSentinel = null
      }
    })
    console.log('Wake Lock acquired')
  } catch (err) {
    console.warn(`WakeLock request failed: ${(err as Error).message}`)
    isActive.value = false
  }
}

async function release() {
  shouldBeActive = false // User explicitly turned it off
  if (wakeLockSentinel) {
    await wakeLockSentinel.release()
    wakeLockSentinel = null
  }
  isActive.value = false
  console.log('Wake Lock released manually')
}

async function toggle() {
  if (isActive.value) {
    await release()
  } else {
    await request()
  }
}

// Auto-reacquire on visibility change if it should be active
if (isSupported && typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible' && shouldBeActive && !isActive.value) {
          await request()
      }
  })
}

export function useWakeLock() {
  function init() {
      // Attempt to auto-start if default is On and supported
      if (isSupported && shouldBeActive && !isActive.value) {
          request()
      }
  }

  return {
    isSupported,
    isActive,
    request,
    release,
    toggle,
    init
  }
}
