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
 * The authoritative write contract for the global FAB singleton.
 *
 * @remarks
 * [THREAT:] Contract Drift. A hand-restated parameter literal can silently
 * desynchronize from the singleton it writes into. Deriving the contract from
 * `fabState` itself makes that drift unrepresentable: a property added to the
 * singleton is accepted automatically, and a property that does not exist on the
 * singleton (for example `visible`, which belongs to the *producer* type
 * `ConsoleFabState` but not to this coordinator) is rejected at compile time.
 */
type FabCoordinatorState = typeof fabState;

/** The closed set of keys the coordinator is permitted to write. */
type FabCoordinatorKey = keyof FabCoordinatorState;

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
   * Toggles the global FAB singleton's visibility flag.
   *
   * @remarks
   * Call this from a view whenever its FabIsland mounts, unmounts, or changes
   * visibility. `dockVisible` and `toastOffset` derive from this flag, so a
   * caller that forgets to flip it back to `false` on unmount leaves the main
   * navigation dock hidden for every other view sharing the singleton.
   *
   * @param isFabIslandVisible - The FabIsland's new visibility state.
   */
  function setFabVisible(isFabIslandVisible: boolean) {
    isFabVisible.value = isFabIslandVisible;
  }

  /**
   * Copies a single contract key from an incoming partial into the global singleton.
   *
   * @remarks
   * [DECISION LOG] Generic Key Narrowing: the key is a single type parameter rather
   * than a union, so the read and the write are provably the same property type.
   * This is what removes the need for the `as any` index write that previously
   * disabled all type enforcement on this code path.
   *
   * @typeParam FabKey - A key that provably exists on the FAB singleton.
   * @param contractKey - The property to merge.
   * @param incomingFabState - The caller-supplied partial update.
   */
  function mergeContractKey<FabKey extends FabCoordinatorKey>(
    contractKey: FabKey,
    incomingFabState: Partial<FabCoordinatorState>,
  ) {
    const incomingValue = incomingFabState[contractKey];
    // Undefined means "leave untouched", not "reset to undefined". Without this
    // guard a caller omitting an optional field would erase unrelated state
    // during a view transition.
    if (incomingValue === undefined) return;
    fabState[contractKey] = incomingValue;
  }

  /**
   * Update the global FAB state from views.
   *
   * @param incomingFabState - Partial update; only keys present on the singleton
   * are honoured. Unknown keys are structurally impossible for typed callers and
   * silently dropped for untyped ones.
   */
  function updateFabState(incomingFabState: Partial<FabCoordinatorState>) {
    // [THREAT:] Global Singleton Pollution. `fabState` is module-level state that
    // never resets for the lifetime of the session. The previous
    // `(fabState as any)[key] = value` write iterated the *caller's* keys, so any
    // key that reached this function -- including one arriving from an untyped or
    // dynamically-built object -- was grafted permanently onto global state with
    // no type checking on either the key or the value.
    // [DECISION LOG] Target-Driven Merge: iterate the singleton's own keys instead
    // of the caller's. The write set is therefore bounded by the state object
    // itself, which is the Poka-Yoke form of this guard: adding a property to
    // `fabState` extends the contract automatically, and no caller can ever widen
    // the singleton's shape at runtime.
    for (const contractKey of Object.keys(fabState) as FabCoordinatorKey[]) {
      mergeContractKey(contractKey, incomingFabState);
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
