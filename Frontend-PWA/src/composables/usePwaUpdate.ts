
import { ref } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'

export function usePwaUpdate() {
  const { needRefresh, updateServiceWorker } = useRegisterSW({
    onRegisterError(error) {
      console.error('SW Registration Error', error)
    }
  })

  // Expose a clean close method to dismiss the prompt without updating immediately
  const close = () => {
    needRefresh.value = false
  }

  return {
    needRefresh,
    updateServiceWorker,
    close
  }
}
