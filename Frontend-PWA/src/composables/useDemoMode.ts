// @ts-nocheck
import { ref } from 'vue'

const DEMO_KEY = 'clash_manager_demo_mode'

// Global singleton state
const isDemoMode = ref(localStorage.getItem(DEMO_KEY) === 'true')

export function useDemoMode() {

    function toggleDemoMode() {
        isDemoMode.value = !isDemoMode.value
        localStorage.setItem(DEMO_KEY, String(isDemoMode.value))

        // Reload to ensure all stores re-initialize with the correct data source
        // This is the safest way to clear reactive cache and reset the app state
        window.location.reload()
    }

    function setDemoMode(val: boolean) {
        isDemoMode.value = val
        localStorage.setItem(DEMO_KEY, String(val))
    }

    return {
        isDemoMode: isDemoMode, // Keep as ref for reactivity
        toggleDemoMode,
        setDemoMode
    }
}
