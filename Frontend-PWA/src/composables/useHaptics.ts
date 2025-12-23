
export function useHaptics() {
    const isSupported = typeof navigator !== 'undefined' && 'vibrate' in navigator
    let hasInteracted = false

    // Track user interaction state to prevent browser warnings on initial load
    if (typeof window !== 'undefined') {
        const setInteracted = () => { 
            hasInteracted = true
            window.removeEventListener('click', setInteracted)
            window.removeEventListener('touchstart', setInteracted)
            window.removeEventListener('keydown', setInteracted)
        }
        window.addEventListener('click', setInteracted, { once: true, passive: true })
        window.addEventListener('touchstart', setInteracted, { once: true, passive: true })
        window.addEventListener('keydown', setInteracted, { once: true, passive: true })
    }

    const vibrate = (pattern: number | number[]) => {
        if (isSupported && hasInteracted) {
            try {
                navigator.vibrate(pattern)
            } catch (e) {
                // Ignore failures (feature policy or device limitations)
            }
        }
    }

    return {
        isSupported,
        // 🖱️ LIGHT TAP: Subtle confirmation
        tap: () => vibrate(15),

        // 🖱️ HEAVY TAP: Stronger feedback
        heavy: () => vibrate(30),

        // 👆 LONG PRESS: Sustained feedback
        longPress: () => vibrate(60),

        // ✅ SUCCESS: Double pulse
        success: () => vibrate([10, 30]),

        // ❌ ERROR: Urgent triple pulse
        error: () => vibrate([50, 40, 50]),

        // ⚠️ WARNING: Medium double pulse
        warning: () => vibrate([30, 30, 30]),

        // 🔄 SYNC: Rippling effect
        sync: () => vibrate([10, 20, 10, 20]),

        custom: (pattern: number | number[]) => vibrate(pattern)
    }
}
