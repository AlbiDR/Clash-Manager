
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
        
        // 🛡️ Wrapper: Ensure the action can strictly run only ONCE per toast instance.
        // This protects against UI race conditions where click events might fire twice.
        const originalAction = options.onAction
        let actionExecuted = false
        
        const safeAction = originalAction ? () => {
            if (actionExecuted) return
            actionExecuted = true
            originalAction()
        } : undefined

        const toast: ToastOptions = {
            id,
            duration: 5000,
            ...options,
            onAction: safeAction
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
        // 🛡️ Guard: Global lock to prevent re-entry
        if (processingIds.has(id)) return

        const idx = toasts.value.findIndex(t => t.id === id)
        if (idx !== -1) {
            processingIds.add(id)
            const toast = toasts.value[idx]
            
            // Remove immediately from UI
            toasts.value.splice(idx, 1)
            
            // Execute the (now safe) action
            if (toast.onAction) {
                toast.onAction()
            }

            // Cleanup lock
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
            onAction: action, // This gets wrapped by add()
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
