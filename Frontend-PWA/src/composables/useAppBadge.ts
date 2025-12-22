
export function useAppBadge() {
    const isSupported = typeof navigator !== 'undefined' && (
        'setAppBadge' in navigator || 'setExperimentalAppBadge' in navigator
    )

    const setBadge = async (count?: number) => {
        if (!isSupported) return

        try {
            if ('setAppBadge' in navigator) {
                await (navigator as any).setAppBadge(count)
            } else if ('setExperimentalAppBadge' in navigator) {
                await (navigator as any).setExperimentalAppBadge(count)
            }
        } catch (error) {
            console.error('Failed to set app badge:', error)
        }
    }

    const clearBadge = async () => {
        if (!isSupported) return

        try {
            if ('clearAppBadge' in navigator) {
                await (navigator as any).clearAppBadge()
            } else if ('clearExperimentalAppBadge' in navigator) {
                await (navigator as any).clearExperimentalAppBadge()
            }
        } catch (error) {
            console.error('Failed to clear app badge:', error)
        }
    }

    return {
        isSupported,
        setBadge,
        clearBadge
    }
}
