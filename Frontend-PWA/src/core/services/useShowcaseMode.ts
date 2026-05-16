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
// Initialized from LocalStorage or URL param to maintain state across sessions or automation.
const getParam = (name: string) => {
  const search = new URLSearchParams(window.location.search);
  if (search.has(name)) return search.get(name);
  const hashSearch = new URLSearchParams(window.location.hash.split("?")[1] || "");
  return hashSearch.get(name);
};

const isShowcaseMode = ref(
  localStorage.getItem(SHOWCASE_KEY) === "true" || getParam("showcase") === "true"
);

export function useShowcaseMode() {
  const { isSyntheticMode, setSyntheticMode } = useSyntheticMode();
  const { isBlueprintMode, setBlueprintMode } = useBlueprintMode();

  // --- INITIALIZATION ---
  // Rationale: If showcase mode was initialized from URL/Storage, we must ensure 
  // children modes are synchronized immediately before the first render.
  if (isShowcaseMode.value) {
    isSyntheticMode.value = true;
    
    // [FLEXIBILITY] Only force blueprint if not explicitly disabled.
    // This allows branding pipelines (like portfolio-stitch.html) to request 
    // Showcase orchestration without skeleton overlays.
    if (localStorage.getItem("clash_manager_blueprint_mode") !== "false") {
      isBlueprintMode.value = true;
    }
  } else if (localStorage.getItem("clash_manager_showcase_mode") === "false") {
    // Only force off if explicitly saved as false, otherwise respect individual settings
    isSyntheticMode.value = false;
    isBlueprintMode.value = false;
  }

  // [REACTIVE SYNC] CHILD -> MASTER
  // Intent: If a user manually toggles Synthetic or Blueprint modes elsewhere,
  // we must update the master "Showcase" status to reflect reality.
  watch(
    [isSyntheticMode, isBlueprintMode],
    ([synthetic, blueprint]) => {
      // MASTER RULE: Showcase mode requires Synthetic data.
      // Skeletons (Blueprint) are optional to allow for high-fidelity captures.
      if (!synthetic && isShowcaseMode.value) {
        isShowcaseMode.value = false;
        localStorage.setItem(SHOWCASE_KEY, "false");
      } else if (synthetic && blueprint && !isShowcaseMode.value) {
        // If both are turned on manually, reflect that in the master toggle
        isShowcaseMode.value = true;
        localStorage.setItem(SHOWCASE_KEY, "true");
      }
    }
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
