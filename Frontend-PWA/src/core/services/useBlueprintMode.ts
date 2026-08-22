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
 * Note: the skeleton geometry shown in this mode now derives from build-time
 * capture (`core/theme/bones.generated.json`, see `scripts/capture_skeletons.ts`)
 * rather than being hand-authored - this service only gates *whether*
 * skeletons show, not their dimensions, so no behavioral change was needed here.
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
// Initialized from LocalStorage or URL param to preserve state across reloads or automation.
const getParam = (name: string) => {
  const search = new URLSearchParams(window.location.search);
  if (search.has(name)) return search.get(name);
  const hashSearch = new URLSearchParams(window.location.hash.split("?")[1] || "");
  return hashSearch.get(name);
};

const isBlueprintMode = ref(
  localStorage.getItem(BLUEPRINT_KEY) === "true" || 
  getParam("blueprint") === "true" ||
  (getParam("showcase") === "true" && localStorage.getItem(BLUEPRINT_KEY) !== "false")
);

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
   * @param targetState - The target boolean state.
   */
  function setBlueprintMode(targetState: boolean) {
    isBlueprintMode.value = targetState;
    localStorage.setItem(BLUEPRINT_KEY, String(targetState));
  }

  return {
    isBlueprintMode: isBlueprintMode, // Keep as ref for reactivity
    toggleBlueprintMode,
    setBlueprintMode,
  };
}
