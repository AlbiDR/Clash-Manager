import { ref, computed, reactive } from "vue";

// Global state to share across instances (Singleton pattern)
const isFabVisible = ref(false);

// Global FAB state for when selection mode is active
const fabState = reactive({
  label: "Open",
  actionHref: undefined as string | undefined,
  isProcessing: false,
  isBlasting: false,
  selectionCount: 0,
  blitzEnabled: false,
  // Callbacks - set by the view that owns the selection
  onAction: null as ((e: MouseEvent) => void) | null,
  onBlitz: null as (() => void) | null,
  onDismiss: null as (() => void) | null,
});

/**
 * 🎨 USE UI COORDINATOR
 * Orchestrates global UI spacing and visibility to prevent component overlap.
 * Ensures the FloatingDock and FAB elements respect each other's boundaries.
 */
export function useUiCoordinator() {
  /**
   * Call this from views when FabIsland visibility changes
   */
  function setFabVisible(visible: boolean) {
    isFabVisible.value = visible;
  }

  /**
   * Update the global FAB state from views
   */
  function updateFabState(state: {
    label?: string;
    actionHref?: string;
    isProcessing?: boolean;
    isBlasting?: boolean;
    selectionCount?: number;
    blitzEnabled?: boolean;
    onAction?: (e: MouseEvent) => void;
    onBlitz?: () => void;
    onDismiss?: () => void;
  }) {
    if (state.label !== undefined) fabState.label = state.label;
    if (state.actionHref !== undefined) fabState.actionHref = state.actionHref;
    if (state.isProcessing !== undefined) fabState.isProcessing = state.isProcessing;
    if (state.isBlasting !== undefined) fabState.isBlasting = state.isBlasting;
    if (state.selectionCount !== undefined) fabState.selectionCount = state.selectionCount;
    if (state.blitzEnabled !== undefined) fabState.blitzEnabled = state.blitzEnabled;
    if (state.onAction !== undefined) fabState.onAction = state.onAction;
    if (state.onBlitz !== undefined) fabState.onBlitz = state.onBlitz;
    if (state.onDismiss !== undefined) fabState.onDismiss = state.onDismiss;
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
    fabState,
    dockVisible,
    fabOffset,
    toastOffset,
    setFabVisible,
    updateFabState,
  };
}

