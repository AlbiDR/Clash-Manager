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
  selectionCount: 0,
  blitzEnabled: false,
  // Callbacks - set by the view that owns the selection
  onAction: null as ((event: MouseEvent) => void) | null,
  onBlitz: null as (() => void) | null,
  onDismiss: null as (() => void) | null,
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
    onAction?: (event: MouseEvent) => void;
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

