
import { ref } from 'vue'

export function useLongPress(callback: () => void, duration = 400) {
    const isLongPress = ref(false)
    let timer: ReturnType<typeof setTimeout> | null = null

    function start() {
        isLongPress.value = false
        timer = setTimeout(() => {
            isLongPress.value = true
            // Native Frontier: Standardized Selection Haptic (Medium)
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate(60) 
            }
            callback()
        }, duration)
    }

    function cancel() {
        if (timer) {
            clearTimeout(timer)
            timer = null
        }
    }

    return {
        isLongPress,
        start,
        cancel
    }
}
