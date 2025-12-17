
import { ref } from 'vue'

export interface ToastOptions {
    id: string
    type: 'success' | 'error' | 'info' | 'undo'
    message: string
    duration?: number
    actionLabel?: string
    onAction?: () => void
}

const toasts = ref<ToastOptions[]>([])

export function useToast() {
    function add(options: Omit<ToastOptions, 'id'>) {
        const id = Date.now().toString() + Math.random().toString(36).substring(2, 9)
        const toast: ToastOptions = {
            id,
            duration: 5000,
            ...options
        }
        toasts.value.push(toast)

        // Native Frontier: Haptic Feedback based on toast type
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            if (options.type === 'error') navigator.vibrate([40, 30, 40])
            else if (options.type === 'success') navigator.vibrate(20)
            else navigator.vibrate(10)
        }

        return id
    }

    function remove(id: string) {
        const idx = toasts.value.findIndex(t => t.id === id)
        if (idx !== -1) {
            toasts.value.splice(idx, 1)
        }
    }

    function triggerAction(id: string) {
        const toast = toasts.value.find(t => t.id === id)
        if (toast && toast.onAction) {
            toast.onAction()
        }
        remove(id)
    }

    function success(message: string) {
        add({ type: 'success', message })
    }

    function error(message: string) {
        add({ type: 'error', message, duration: 8000 })
    }

    function info(message: string) {
        add({ type: 'info', message })
    }

    function undo(message: string, action: () => void) {
        add({
            type: 'undo',
            message,
            actionLabel: 'UNDO',
            onAction: action,
            duration: 6000
        })
    }

    return {
        toasts,
        add,
        remove,
        triggerAction,
        success,
        error,
        info,
        undo
    }
}

