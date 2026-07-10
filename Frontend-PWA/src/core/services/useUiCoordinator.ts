// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref, computed, reactive } from "vue";

// Global state to share across instances (Singleton pattern)
const isFabVisible = ref(false);

// Global FAB state for when selection mode is active
const fabState = reactive({
  label: "Open",
  actionHref: undefined as string | undefined,
  isProcessing: false,
  isBlasting: false,
  isHarvesting: false,
  activeHarvester: null as "global" | "local" | null,
  selectionCount: 0,
  blitzEnabled: false,
  dismissIcon: "close",
  // Callbacks - set by the view that owns the selection
  onAction: null as ((event: MouseEvent) => void) | null,
  onBlitz: null as (() => void) | null,
  onDismiss: null as (() => void) | null,
  onGlobalHarvest: null as (() => void) | null,
  onLocalHarvest: null as (() => void) | null,
  onAbortHarvest: null as (() => void) | null,
});

/**
 * COMPOSABLE: useUiCoordinator
 *
 * @remarks
 * Orchestrates global UI spacing and visibility to prevent component overlap.
 * This is a Layer 1 (@core) service that ensures the FloatingDock and FAB
 * (FabIsland) elements respect each other's boundaries.
 *
 * It manages a singleton state for the Floating Action Button (FAB) to
 * coordinate actions and labels across different feature views.
 *
 * **Import Boundaries:**
 * - Allowed: Layer 1 (@core) and external libraries (Vue).
 * - Forbidden: Layer 2 (@shared), Layer 3 (@features), and Layer 4 (@app).
 *
 * @sideeffects
 * - Mutates the global singleton `isFabVisible` and `fabState`.
 *
 * @returns
 * - `isFabVisible`: Reactive boolean indicating if the FabIsland is active.
 * - `fabState`: Global reactive object for FAB configuration (label, action, etc).
 * - `dockVisible`: Computed boolean determining if the main navigation dock should show.
 * - `fabOffset`: Base bottom offset for the FAB.
 * - `toastOffset`: Dynamic bottom offset for toast notifications to avoid occlusion.
 * - `setFabVisible`: Action to toggle FAB visibility.
 * - `updateFabState`: Action to partially update the global FAB configuration.
 */
export function useUiCoordinator() {
  /**
   * Call this from views when FabIsland visibility changes
   */
  function setFabVisible(isFabIslandVisible: boolean) {
    isFabVisible.value = isFabIslandVisible;
  }

  /**
   * Update the global FAB state from views
   */
  function updateFabState(incomingFabState: {
    label?: string;
    actionHref?: string;
    isProcessing?: boolean;
    isBlasting?: boolean;
    isHarvesting?: boolean;
    activeHarvester?: "global" | "local" | null;
    selectionCount?: number;
    blitzEnabled?: boolean;
    dismissIcon?: string;
    onAction?: (event: MouseEvent) => void;
    onBlitz?: () => void;
    onDismiss?: () => void;
    onGlobalHarvest?: () => void;
    onLocalHarvest?: () => void;
    onAbortHarvest?: () => void;
  }) {
    // [PERF] Optimized State Merging: Partially update the reactive fabState
    // object while preserving undefined guards for optional inputs.
    for (const [key, value] of Object.entries(incomingFabState)) {
      if (value !== undefined) {
        (fabState as any)[key] = value;
      }
    }
  }

  /**
   * Determines if the main navigation dock should be visible
   * Logic: Hide dock when the action-oriented FAB is active
   */
  const dockVisible = computed(() => !isFabVisible.value);

  /**
   * Dynamic bottom offset for the Fab Island.
   * Rationale: Ensures the primary action button sits above the
   * safe area of most mobile browsers.
   */
  const fabOffset = computed(() => {
    return 24; // Base offset in pixels
  });

  /**
   * Dynamic bottom offset for the Toast Container.
   * Strategically shifts to stay visible above other interactive layers.
   */
  const toastOffset = computed(() => {
    // THREAT: Occlusion. If Toast and FAB overlap, users cannot dismiss errors.
    // Rationale: We dynamically stack the toast layer based on what's active below it.
    if (isFabVisible.value) {
      // Positioned above the Fab Island layer (Base + Height of FAB + Margin)
      return fabOffset.value + 80;
    }
    // Positioned above the Floating Dock layer (fixed height of the dock)
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

