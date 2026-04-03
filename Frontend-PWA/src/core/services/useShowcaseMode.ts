// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * SHOWCASE MODE SERVICE (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Orchestrates the "Showcase" state, which is the simultaneous
 * activation of Synthetic (Mock) and Blueprint (Skeleton) modes.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * This service implements a master-child synchronization pattern. It acts as
 * a Layer 1 (@core) singleton that ensures consistency between the top-level
 * Showcase toggle and its constituent sub-modes.
 *
 * Side Effects:
 * - Persists state to `localStorage` under 'clash_manager_showcase_mode'.
 * - Synchronizes state changes to/from `useSyntheticMode` and `useBlueprintMode`.
 */
import { useBlueprintMode } from "./useBlueprintMode";
import { useSyntheticMode } from "./useSyntheticMode";

import { ref, watch } from "vue";
const SHOWCASE_KEY = "clash_manager_showcase_mode";

// Global singleton state
const isShowcaseMode = ref(localStorage.getItem(SHOWCASE_KEY) === "true");

export function useShowcaseMode() {
  const { isSyntheticMode, setSyntheticMode } = useSyntheticMode();
  const { isBlueprintMode, setBlueprintMode } = useBlueprintMode();

  // [REACTIVE SYNC] CHILD -> MASTER
  // Intent: If a user manually toggles Synthetic or Blueprint modes elsewhere,
  // we must update the master "Showcase" status to reflect reality.
  watch(
    [isSyntheticMode, isBlueprintMode],
    ([synthetic, blueprint]) => {
      // The master Showcase state is defined as BOTH sub-modes being active.
      const bothOn = synthetic && blueprint;
      if (isShowcaseMode.value !== bothOn) {
        isShowcaseMode.value = bothOn;
        localStorage.setItem(SHOWCASE_KEY, String(bothOn));
      }
    },
    { immediate: true },
  );

  /**
   * Toggles the master Showcase state and propagates it to all child modes.
   */
  function toggleShowcaseMode() {
    const newValue = !isShowcaseMode.value;
    isShowcaseMode.value = newValue;
    localStorage.setItem(SHOWCASE_KEY, String(newValue));

    // [PROPAGATION] MASTER -> CHILD
    // Intent: Changing the master toggle must immediately enable/disable all
    // dependent modes (Synthetic & Blueprint) to maintain UI consistency.
    setSyntheticMode(newValue);
    setBlueprintMode(newValue);
  }

  /**
   * Sets the master Showcase state to a specific boolean value.
   */
  function setShowcaseMode(val: boolean) {
    if (isShowcaseMode.value === val) return;
    isShowcaseMode.value = val;
    localStorage.setItem(SHOWCASE_KEY, String(val));

    // [PROPAGATION] MASTER -> CHILD
    setSyntheticMode(val);
    setBlueprintMode(val);
  }

  return {
    isShowcaseMode,
    toggleShowcaseMode,
    setShowcaseMode,
  };
}
