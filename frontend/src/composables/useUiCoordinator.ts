
import { ref, computed } from 'vue'

// Global state to share across instances
const isFabVisible = ref(false)

export function useUiCoordinator() {
    /**
     * Call this from views when FabIsland visibility changes
     */
    function setFabVisible(visible: boolean) {
        isFabVisible.value = visible
    }

    /**
     * Determines if the main navigation dock should be visible
     * Business Logic: Hide dock when action fab is active
     */
    const dockVisible = computed(() => !isFabVisible.value)

    /**
     * Dynamic bottom offset for the Fab Island.
     * Moves to the dock's position when dock is hidden.
     */
    const fabOffset = computed(() => {
        return 24 // Base offset (matching FloatingDock)
    })

    /**
     * Dynamic bottom offset for the Toast Container.
     * Calculated to sit comfortably above the highest visible UI element.
     */
    const toastOffset = computed(() => {
        if (isFabVisible.value) {
            // Above Fab Island (approx 80px height + margin)
            return fabOffset.value + 80
        }
        // Above Floating Dock (approx 70px height + margin)
        return 110
    })

    return {
        isFabVisible,
        dockVisible,
        fabOffset,
        toastOffset,
        setFabVisible
    }
}
