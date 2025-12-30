// Custom Service Worker badge handler
// This file is injected into the generated service worker

declare const self: ServiceWorkerGlobalScope

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SET_BADGE') {
        const count = event.data.count || 0

        // Try to set badge via Service Worker registration
        if ('setAppBadge' in self.registration) {
            if (count > 0) {
                (self.registration as any).setAppBadge(count)
                    .then(() => console.log(`[SW] Badge set to ${count}`))
                    .catch((e: Error) => console.error('[SW] Failed to set badge:', e))
            } else {
                (self.registration as any).clearAppBadge()
                    .then(() => console.log('[SW] Badge cleared'))
                    .catch((e: Error) => console.error('[SW] Failed to clear badge:', e))
            }
        } else if ('setExperimentalAppBadge' in self.registration) {
            if (count > 0) {
                (self.registration as any).setExperimentalAppBadge(count)
                    .then(() => console.log(`[SW] Badge set to ${count} (experimental)`))
                    .catch((e: Error) => console.error('[SW] Failed to set experimental badge:', e))
            } else {
                (self.registration as any).clearExperimentalAppBadge()
                    .then(() => console.log('[SW] Badge cleared (experimental)'))
                    .catch((e: Error) => console.error('[SW] Failed to clear experimental badge:', e))
            }
        } else {
            console.warn('[SW] Badge API not available in Service Worker')
        }
    }
})

export { }
