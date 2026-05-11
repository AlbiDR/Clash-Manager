// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref } from "vue";

/**
 * SYNTHETIC MODE SERVICE (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Provides a global toggle for high-fidelity mock data demonstration.
 * This service allows the UI to be decoupled from live backend dependencies
 * for showcase, testing, and development purposes without changing code.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 1 (@core)
 * - **Import Boundaries:** This service is a standalone utility. It must not
 *   import from Shared (@shared), Features (@features), or App (@app).
 *
 * **Persistence:**
 * The state is persisted to `localStorage` to ensure the selected mode
 * survives page reloads.
 */

const SYNTHETIC_KEY = "clash_manager_synthetic_mode";

// [SINGLETON] Global reactive state
// Initialized from LocalStorage or URL param to maintain state across sessions or automation.
const getParam = (name: string) => {
  const search = new URLSearchParams(window.location.search);
  if (search.has(name)) return search.get(name);
  const hashSearch = new URLSearchParams(window.location.hash.split("?")[1] || "");
  return hashSearch.get(name);
};

const isSyntheticMode = ref(
  localStorage.getItem(SYNTHETIC_KEY) === "true" || getParam("synthetic") === "true"
);

/**
 * COMPOSABLE: useSyntheticMode
 *
 * @remarks
 * Brokered access to the global synthetic mode state.
 *
 * @returns
 * - `isSyntheticMode`: Reactive boolean indicating if mock data is active.
 * - `toggleSyntheticMode`: Method to flip the current state.
 * - `setSyntheticMode`: Method to explicitly set the mode.
 *
 * @sideeffects
 * - WRITES to `localStorage` via the `SYNTHETIC_KEY`.
 */
export function useSyntheticMode() {
  /**
   * Toggles the synthetic mode state and persists the change.
   */
  function toggleSyntheticMode() {
    isSyntheticMode.value = !isSyntheticMode.value;
    localStorage.setItem(SYNTHETIC_KEY, String(isSyntheticMode.value));
  }

  /**
   * Explicitly sets the synthetic mode state and persists the change.
   *
   * @param val - The target boolean state.
   */
  function setSyntheticMode(val: boolean) {
    isSyntheticMode.value = val;
    localStorage.setItem(SYNTHETIC_KEY, String(val));
  }

  return {
    isSyntheticMode, // Keep as ref for reactivity
    toggleSyntheticMode,
    setSyntheticMode,
  };
}
