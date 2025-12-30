// Custom Service Worker badge handler
// This file is imported into the generated service worker via workbox.importScripts

/* global self */

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SET_BADGE') {
        const count = event.data.count || 0

        // Try to set badge via Service Worker registration (supported on some platforms)
        if ('setAppBadge' in self.registration) {
            if (count > 0) {
                self.registration.setAppBadge(count)
                    .then(() => console.log(`[SW] Badge set to ${count}`))
                    .catch((e) => console.error('[SW] Failed to set badge:', e))
            } else {
                self.registration.clearAppBadge()
                    .then(() => console.log('[SW] Badge cleared'))
                    .catch((e) => console.error('[SW] Failed to clear badge:', e))
            }
        } else if ('setExperimentalAppBadge' in self.registration) {
            if (count > 0) {
                self.registration.setExperimentalAppBadge(count)
                    .then(() => console.log(`[SW] Badge set to ${count} (experimental)`))
                    .catch((e) => console.error('[SW] Failed to set experimental badge:', e))
            } else {
                self.registration.clearExperimentalAppBadge()
                    .then(() => console.log('[SW] Badge cleared (experimental)'))
                    .catch((e) => console.error('[SW] Failed to clear experimental badge:', e))
            }
        } else {
            // Android Chrome fallback: Show a silent notification to trigger the badge/dot
            // This is the only way to get a badge on Android PWAs as of 2024/2025
            if ('showNotification' in self.registration) {
                if (count > 0) {
                    const options = {
                        body: `${count} pending items in Clash Manager`,
                        tag: 'badge-count',
                        icon: '/Clash-Manager/pwa-192x192.png',
                        badge: '/Clash-Manager/monochrome-icon-512x512.png',
                        silent: true,
                        renotify: false, // Don't buzz/vibrate on every update
                        data: { count },
                        // Ensures the notification appears but doesn't persist too long
                        // Most launchers will show the dot as long as the notification exists
                    };
                    self.registration.showNotification('Clash Manager', options);
                } else {
                    // Clear notifications to remove the badge/dot
                    self.registration.getNotifications({ tag: 'badge-count' }).then(notifications => {
                        notifications.forEach(n => n.close());
                    });
                }
            }
        }
    }
})
