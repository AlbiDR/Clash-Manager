export function useShare() {
    const canShare = typeof navigator !== 'undefined' && !!navigator.share

    async function share(data: ShareData) {
        if (!canShare) {
            console.warn('Web Share API not supported')
            return
        }

        try {
            await navigator.share(data)
        } catch (err) {
            if ((err as Error).name !== 'AbortError') {
                console.error('Share failed:', err)
            }
        }
    }

    return {
        canShare,
        share
    }
}
