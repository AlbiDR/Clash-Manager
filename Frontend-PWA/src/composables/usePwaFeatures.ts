
export function usePwaFeatures() {

    /**
     * Registers Periodic Background Sync for data freshness
     */
    async function initPeriodicSync() {
        if (!('periodicSync' in navigator)) {
            console.log('[PWA] Periodic Sync not supported in this browser.');
            return;
        }

        try {
            const registration = await navigator.serviceWorker.ready;
            const status = await (navigator as any).permissions.query({
                name: 'periodic-background-sync',
            });

            if (status.state === 'granted') {
                await (registration as any).periodicSync.register('content-sync', {
                    minInterval: 12 * 60 * 60 * 1000, // 12 hours
                });
                console.log('[PWA] Periodic Sync registered successfully.');
            } else {
                console.log('[PWA] Periodic Sync permission not granted.');
            }
        } catch (error) {
            console.error('[PWA] Periodic Sync registration failed:', error);
        }
    }

    /**
     * Requests notification permission and initializes Push logic
     */
    async function initPush() {
        if (!('Notification' in window)) {
            console.log('[PWA] Notifications not supported.');
            return;
        }

        try {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                console.log('[PWA] Notification permission granted.');

                // Note: Actual push subscription requires a VAPID public key
                // and a backend to store the endpoint. 
                // We're setting up the client-side capability here.
                const registration = await navigator.serviceWorker.ready;
                const subscription = await registration.pushManager.getSubscription();

                if (!subscription) {
                    console.log('[PWA] No active push subscription found.');
                    // If we had a VAPID key:
                    // const newSub = await registration.pushManager.subscribe({ ... });
                } else {
                    console.log('[PWA] Active push subscription:', subscription.endpoint);
                }
            } else {
                console.log('[PWA] Notification permission denied.');
            }
        } catch (error) {
            console.error('[PWA] Push initialization failed:', error);
        }
    }

    /**
     * Handles messages from the Service Worker
     */
    function initMessageListener() {
        if (!('serviceWorker' in navigator)) return;

        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'DATA_UPDATED') {
                console.log('[PWA] Data refreshed in background by SW.');
            }
        });
    }

    return {
        initPeriodicSync,
        initPush,
        initMessageListener
    };
}
