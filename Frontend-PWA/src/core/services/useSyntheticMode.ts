// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref, type Ref } from "vue";

/**
 * SYNTHETIC MODE SERVICE (Layer 1 Core)
 * ----------------------------------------------------------------------------
 * Rationale: Provides a global toggle for high-fidelity mock data demonstration.
 * This service allows the UI to be decoupled from live backend dependencies
 * for showcase, testing, and development purposes without changing code.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 1 (@core)
 * - **Satisfaction:** Satisfies CleanStack Architecture ADR Section I (Core Services)
 *   and ADR Section II (Presentation Orchestration). Decouples view rendering from
 *   live network state by establishing an authoritative, cross-cutting mock mode.
 * - **Import Boundaries:** This service is a standalone utility. It must not
 *   import from Shared (@shared), Features (@features), or App (@app).
 *   May only import from Layer 1 (@core) or Layer 0 substrate.
 *
 * **Persistence:**
 * The state is persisted to `localStorage` to ensure the selected mode
 * survives page reloads.
 */

/**
 * Storage key for persisting synthetic mode activation state in localStorage.
 *
 * @remarks
 * [DECISION LOG] Synchronous LocalStorage key ensures immediate evaluation
 * during application bootstrap before initial Vue component mount.
 */
const SYNTHETIC_KEY = "clash_manager_synthetic_mode";

/**
 * Return contract interface for `useSyntheticMode`.
 *
 * @remarks
 * Defines the public reactive state and operational controllers for synthetic mode.
 */
export interface UseSyntheticModeReturn {
  /** Reactive boolean indicating whether synthetic mock data mode is currently active. */
  isSyntheticMode: Ref<boolean>;
  /** Toggles the synthetic mode state between enabled and disabled and persists the change. */
  toggleSyntheticMode: () => void;
  /** Explicitly sets the synthetic mode state to a target boolean and persists the change. */
  setSyntheticMode: (targetState: boolean) => void;
}

/**
 * Extracts a query parameter value from the current browser location search or hash string.
 *
 * @remarks
 * [DECISION LOG] Single-Page Application (SPA) Hash Routing Compatibility:
 * Checks standard search parameters (`window.location.search`) first, and falls back
 * to hash-based query parameters (`location.hash.split("?")[1]`) to support hash router modes.
 *
 * [GUARD] SSR / Headless Safety:
 * Verifies `window` existence prior to accessing `window.location`.
 *
 * @param name - The query parameter key name to inspect.
 * @returns The string value if present, or null otherwise.
 */
const getParam = (name: string): string | null => {
  if (typeof window === "undefined") return null;
  const search = new URLSearchParams(window.location.search);
  if (search.has(name)) return search.get(name);
  const hashSearch = new URLSearchParams(window.location.hash.split("?")[1] || "");
  return hashSearch.get(name);
};

/**
 * Global reactive singleton for synthetic mode state.
 *
 * @remarks
 * [DECISION LOG] Singleton Reactive State: Holding synthetic mode activation at module scope
 * guarantees that all consumers (stores, adapters, and UI badges) share an identical, synchronized
 * mock data switch without prop-drilling or event emitter overhead.
 *
 * Resolution Priority:
 * 1. Explicit LocalStorage persistence (`clash_manager_synthetic_mode === 'true'`).
 * 2. Explicit URL query parameter (`?synthetic=true`).
 * 3. Showcase cascade: If `?showcase=true` is present and localStorage has not explicitly disabled it (`!== 'false'`).
 *
 * [THREAT:] Accidental production leak of mock states. The showcase fallback respects explicit
 * 'false' in localStorage to prevent showcase URLs from forcing mock data when disabled by the user.
 */
const isSyntheticMode = ref(
  (typeof localStorage !== "undefined" && localStorage.getItem(SYNTHETIC_KEY) === "true") ||
  getParam("synthetic") === "true" ||
  (getParam("showcase") === "true" && (typeof localStorage === "undefined" || localStorage.getItem(SYNTHETIC_KEY) !== "false"))
);

/**
 * COMPOSABLE: useSyntheticMode
 *
 * @remarks
 * Brokered access to the global synthetic mode state and persistence controllers.
 *
 * Satisfies CleanStack Architecture ADR Section I (Core Services) by providing
 * an authoritative gateway for offline and demo data switching.
 *
 * @returns Object conforming to `UseSyntheticModeReturn` containing reactive state and mutation actions.
 *
 * @sideeffects
 * - Reads and writes to `localStorage` under `clash_manager_synthetic_mode`.
 */
export function useSyntheticMode(): UseSyntheticModeReturn {
  /**
   * Toggles the synthetic mode state and persists the change to storage.
   *
   * @remarks
   * [DECISION LOG] Flips the reactive ref and synchronizes to localStorage.
   */
  function toggleSyntheticMode(): void {
    isSyntheticMode.value = !isSyntheticMode.value;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(SYNTHETIC_KEY, String(isSyntheticMode.value));
    }
  }

  /**
   * Explicitly sets the synthetic mode state and persists the change to storage.
   *
   * @remarks
   * [DECISION LOG] Enforces deterministic assignment, useful for reset routines and automated test harnesses.
   *
   * @param targetState - The target boolean state to assign.
   */
  function setSyntheticMode(targetState: boolean): void {
    isSyntheticMode.value = targetState;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(SYNTHETIC_KEY, String(targetState));
    }
  }

  return {
    isSyntheticMode, // Keep as ref for reactivity
    toggleSyntheticMode,
    setSyntheticMode,
  };
}
