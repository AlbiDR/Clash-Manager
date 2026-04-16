// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref } from "vue";

/**
 * BLUEPRINT MODE SERVICE (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Allows layout stability auditing by replacing high-fidelity
 * content with geometric skeletons.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * This service manages a global toggle that forces the application into a
 * 'Blueprint' state. In this mode, UI components are stripped of their
 * decorative elements and content, leaving only their structural skeletons
 * to facilitate interaction design and layout debugging.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 (@core)
 * - **Import Boundaries:** Pure logic, zero dependencies on higher layers.
 *
 * @sideeffects
 * - PERSISTS state to `localStorage` under the key `clash_manager_blueprint_mode`.
 */
const BLUEPRINT_KEY = "clash_manager_blueprint_mode";

// [PERF] Singleton State: Ensures all components share the same toggle status.
// Initialized from LocalStorage to preserve user preference across reloads.
const isBlueprintMode = ref(localStorage.getItem(BLUEPRINT_KEY) === "true");

/**
 * COMPOSABLE: useBlueprintMode
 *
 * @remarks
 * Provides access to the global blueprint mode state and control methods.
 *
 * @returns
 * - `isBlueprintMode`: Reactive reference to the toggle status.
 * - `toggleBlueprintMode`: Function to flip the current status.
 * - `setBlueprintMode`: Function to explicitly set the status.
 */
export function useBlueprintMode() {
  /**
   * Flips the current Blueprint Mode status and persists it.
   */
  function toggleBlueprintMode() {
    isBlueprintMode.value = !isBlueprintMode.value;
    localStorage.setItem(BLUEPRINT_KEY, String(isBlueprintMode.value));
  }

  /**
   * Explicitly sets the Blueprint Mode status and persists it.
   * @param val - The target boolean state.
   */
  function setBlueprintMode(val: boolean) {
    isBlueprintMode.value = val;
    localStorage.setItem(BLUEPRINT_KEY, String(val));
  }

  return {
    isBlueprintMode: isBlueprintMode, // Keep as ref for reactivity
    toggleBlueprintMode,
    setBlueprintMode,
  };
}
