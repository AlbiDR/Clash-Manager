
import { ref, onUnmounted } from 'vue'

export function useWakeLock() {
  const isSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator
  const isActive = ref(false)
  let wakeLockSentinel: WakeLockSentinel | null = null

  async function request() {
    if (!isSupported) return
    try {
      wakeLockSentinel = await navigator.wakeLock.request('screen')
      isActive.value = true
      
      wakeLockSentinel.addEventListener('release', () => {
        isActive.value = false
        console.log('Wake Lock released')
      })
      console.log('Wake Lock acquired')
    } catch (err) {
      console.error(`${(err as Error).name}, ${(err as Error).message}`)
      isActive.value = false
    }
  }

  async function release() {
    if (wakeLockSentinel) {
      await wakeLockSentinel.release()
      wakeLockSentinel = null
      isActive.value = false
    }
  }

  async function toggle() {
    if (isActive.value) {
      await release()
    } else {
      await request()
    }
  }

  // Auto-reacquire on visibility change (Native behavior consistency)
  if (isSupported && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', async () => {
        if (wakeLockSentinel !== null && document.visibilityState === 'visible') {
            await request()
        }
    })
  }

  onUnmounted(() => {
    release()
  })

  return {
    isSupported,
    isActive,
    request,
    release,
    toggle
  }
}
