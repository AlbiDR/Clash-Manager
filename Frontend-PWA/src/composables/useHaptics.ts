
export function useHaptics() {
    const isSupported = typeof navigator !== 'undefined' && 'vibrate' in navigator

    const vibrate = (pattern: number | number[]) => {
        if (isSupported) {
            try {
                navigator.vibrate(pattern)
            } catch (e) {
                console.warn('Haptic feedback not supported or failed', e)
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
