import { ref, computed } from "vue";

// Global state to share across instances (Singleton pattern)
const isFabVisible = ref(false);

/**
 * 🎨 USE UI COORDINATOR
 * Orchestrates global UI spacing and visibility to prevent component overlap.
 * Ensures the FloatingDock and FabIsland respect each other's boundaries.
 */
export function useUiCoordinator() {
  /**
   * Call this from views when FabIsland visibility changes
   */
  function setFabVisible(visible: boolean) {
    isFabVisible.value = visible;
  }

  /**
   * Determines if the main navigation dock should be visible
   * Logic: Hide dock when the action-oriented FAB is active
   */
  const dockVisible = computed(() => !isFabVisible.value);

  /**
   * Dynamic bottom offset for the Fab Island.
   */
  const fabOffset = computed(() => {
    return 24; // Base offset in pixels
  });

  /**
   * Dynamic bottom offset for the Toast Container.
   * Strategically shifts to stay visible above other interactive layers.
   */
  const toastOffset = computed(() => {
    if (isFabVisible.value) {
      // Positioned above the Fab Island layer
      return fabOffset.value + 80;
    }
    // Positioned above the Floating Dock layer
    return 110;
  });

  return {
    isFabVisible,
    dockVisible,
    fabOffset,
    toastOffset,
    setFabVisible,
  };
}

