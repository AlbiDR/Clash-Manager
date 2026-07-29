// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref, computed, reactive } from "vue";

// Global state to share across instances (Singleton pattern)
const isFabVisible = ref(false);

/**
 * Global FAB state for when selection mode is active.
 *
 * @remarks
 * [DECISION LOG] Singleton Reactive State: Using a global reactive object ensures
 * that FAB configuration (labels, actions, and loading states) remains synchronized
 * across disparate feature views without prop-drilling or complex event buses.
 */
const fabState = reactive({
  /** The primary label displayed on the FAB action button. */
  label: "Open",
  /** Optional URL for the primary action; used for direct navigation. */
  actionHref: undefined as string | undefined,
  /** Indicates if the primary action is currently in-flight. */
  isProcessing: false,
  /** Indicates if the 'Blitz' (rapid processing) mode is active. */
  isBlasting: false,
  /** Indicates if a data harvesting operation is active. */
  isHarvesting: false,
  /** The scope of the current harvester ('global' API vs 'local' scraper). */
  activeHarvester: null as "global" | "local" | null,
  /** The current number of items selected in the active view. */
  selectionCount: 0,
  /** Indicates if the Blitz Mode feature is toggled on in settings. */
  blitzEnabled: false,
  /** Indicates if the Global/Local Harvest actions are wired up for the active view. */
  harvestEnabled: false,
  /** The icon name for the dismiss/close button. */
  dismissIcon: "close",
  // Callbacks - set by the view that owns the selection
  /** Callback for the primary action button. */
  onAction: null as ((event: MouseEvent) => void) | null,
  /** Callback to trigger the Blitz Mode engine. */
  onBlitz: null as (() => void) | null,
  /** Callback to dismiss the FAB and clear selections. */
  onDismiss: null as (() => void) | null,
  /** Callback to trigger a global data harvest (API). */
  onGlobalHarvest: null as (() => void) | null,
  /** Callback to trigger a local data harvest (Scraper). */
  onLocalHarvest: null as (() => void) | null,
  /** Callback to abort an active harvest operation. */
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
    harvestEnabled?: boolean;
    dismissIcon?: string;
    onAction?: (event: MouseEvent) => void;
    onBlitz?: () => void;
    onDismiss?: () => void;
    onGlobalHarvest?: () => void;
    onLocalHarvest?: () => void;
    onAbortHarvest?: () => void;
  }) {
    // [THREAT:] Partial State Corruption.
    // [DECISION LOG] Optimized State Merging: Partially update the reactive fabState
    // object while preserving undefined guards for optional inputs. This prevents
    // accidental resetting of unrelated state properties during view transitions.
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
    // [THREAT:] UI Occlusion. If Toast and FAB overlap, users cannot dismiss errors.
    // [DECISION LOG] Stacked Layering: We dynamically stack the toast layer based
    // on what's active below it.
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
