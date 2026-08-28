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
  // [ROUTING RECOVERY] Fallback query string parsing for both search query and hash parameters.
  const search = new URLSearchParams(window.location.search);
  if (search.has(name)) return search.get(name);
  const hashSearch = new URLSearchParams(window.location.hash.split("?")[1] || "");
  return hashSearch.get(name);
};

// [DEFAULT OVERRIDE] Blueprint state evaluates local persistence first, followed by direct URL overrides,
// and finally showcase mode defaults unless explicitly disabled via LocalStorage.
const isBlueprintMode = ref(
  localStorage.getItem(BLUEPRINT_KEY) === "true" || 
  getParam("blueprint") === "true" ||
  (getParam("showcase") === "true" && localStorage.getItem(BLUEPRINT_KEY) !== "false")
);

/**
 * COMPOSABLE: useBlueprintMode
 *
 * @remarks
 * Provides access to the global blueprint mode state and control methods within Layer 1 (@core).
 * Blueprint mode acts as a structural debugging overlay that strips high-fidelity UI elements down
 * to geometric skeleton components (`core/theme/bones.generated.json`).
 *
 * Satisfies ADR Section I: Architectural Boundaries & Section II: State Management.
 * @remarks Satisfies ADR Section III: Validation Boundaries & master-child synchronization with useShowcaseMode.
 *
 * **Side Effects:**
 * - Reads from and persists state to `localStorage` under key `clash_manager_blueprint_mode`.
 * - Interacts with URL query parameters (`blueprint=true` or `showcase=true`) for headless layout testing.
 *
 * @returns
 * - `isBlueprintMode`: Reactive reference to the global blueprint toggle status.
 * - `toggleBlueprintMode`: Function to flip current blueprint status and synchronize `localStorage`.
 * - `setBlueprintMode`: Function to explicitly set target blueprint boolean state and synchronize `localStorage`.
 */
export function useBlueprintMode() {
  /**
   * Flips the current Blueprint Mode status and persists the updated value to `localStorage`.
   */
  function toggleBlueprintMode() {
    // [STATE MUTATION] Toggle reactive boolean state.
    isBlueprintMode.value = !isBlueprintMode.value;
    // [PERSISTENCE] Synchronize state write to local storage to maintain session continuity across reloads.
    localStorage.setItem(BLUEPRINT_KEY, String(isBlueprintMode.value));
  }

  /**
   * Explicitly sets the Blueprint Mode status and persists the updated value to `localStorage`.
   *
   * @param targetState - The target boolean state for Blueprint Mode.
   */
  function setBlueprintMode(targetState: boolean) {
    // [STATE MUTATION] Update reactive state to specified boolean target.
    isBlueprintMode.value = targetState;
    // [PERSISTENCE] Synchronize state write to local storage.
    localStorage.setItem(BLUEPRINT_KEY, String(targetState));
  }

  return {
    isBlueprintMode: isBlueprintMode, // Keep as ref for reactivity
    toggleBlueprintMode,
    setBlueprintMode,
  };
}
