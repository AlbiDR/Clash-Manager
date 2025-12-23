
// @ts-nocheck
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
const processingIds = new Set<string>()

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
        // 🛡️ Guard: Prevent double-execution if the ID is already being processed
        if (processingIds.has(id)) return

        const idx = toasts.value.findIndex(t => t.id === id)
        if (idx !== -1) {
            processingIds.add(id)
            const toast = toasts.value[idx]
            
            // Remove immediately
            toasts.value.splice(idx, 1)
            
            if (toast.onAction) {
                toast.onAction()
            }

            // Clean up set after a delay to ensure transition completes and no ghost clicks are registered
            setTimeout(() => {
                processingIds.delete(id)
            }, 1000)
        }
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
