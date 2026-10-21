// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { readonly, ref, type DeepReadonly, type Ref } from "vue";
import type { WindowWithBridge } from "../types";

/**
 * Return interface contract for `usePowerSaving`.
 */
export interface UsePowerSavingReturn {
  /**
   * Read-only reactive boolean reflecting native Android Battery Saver status.
   */
  isPowerSaving: DeepReadonly<Ref<boolean>>;
}

/**
 * Module-level reactive state tracking Android Battery Saver mode.
 *
 * @remarks
 * [DECISION LOG] Module Singleton State: Maintained across composable call sites to prevent
 * duplicate event listener attachments or divergent power-saving attributes in DOM elements.
 */
// EPHEMERAL: intentionally resets on cold start
const isPowerSaving = ref(false);

/**
 * Guard flag enforcing idempotent, single-attachment of window and document event listeners.
 */
let isInitialized = false;

/**
 * Re-evaluates native power-saving state directly from the Android WebView bridge.
 *
 * @remarks
 * [THREAT: Stale Hardware State] Native power-saving mode shifts while the app is backgrounded
 * or unfocused do not reliably push DOM events. Directly re-querying `isPowerSaveMode()`
 * on window focus or visibility change guarantees state synchronization.
 *
 * [DECISION LOG] Direct Bridge Re-evaluation: Re-reads the native `AndroidBridge` interface
 * rather than relying on event payloads, ensuring fault-tolerant resolution even if event payload
 * definitions evolve across WebView versions.
 *
 * Satisfies CleanStack Architecture ADR Section I (Core Services) & Section II (Layer 1 Hardware Brokering).
 *
 * @sideeffects
 * Toggles the `data-power-saving` attribute on `document.documentElement` to trigger
 * global CSS power-saving optimizations (e.g. reduced keyframe animations and blur filters).
 */
function refreshPowerSaving() {
  try {
    const bridge = (window as WindowWithBridge).AndroidBridge;
    isPowerSaving.value = bridge?.isPowerSaveMode?.() === true;
  } catch {
    // Older or unavailable shells cannot report the system switch; gracefully default to false.
    isPowerSaving.value = false;
  }
  document.documentElement?.toggleAttribute("data-power-saving", isPowerSaving.value);
}

/**
 * COMPOSABLE: usePowerSaving
 *
 * @remarks
 * Shared, event-driven Android Battery Saver state orchestrator. Browsers lack an equivalent
 * standard Battery Saver switch API; colour-scheme and reduced-motion media queries remain authoritative
 * for web clients, while this service acts as a Layer 1 hardware broker for native Android shells.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 (@core)
 * - **Satisfaction:** Satisfies ADR Section I (Core Services) and ADR Section II (Hardware Brokering).
 * - **Import Boundaries:** May import from Layer 1 (@core) and Layer 0 (@substrate).
 *   Imports from Shared (@shared), Features (@features), or App (@app) are forbidden.
 *
 * @returns Object conforming to `UsePowerSavingReturn` containing read-only `isPowerSaving` ref.
 *
 * @sideeffects
 * - Attaches `cm-power-save-change`, `focus`, and `visibilitychange` event listeners to `window` and `document`.
 * - Toggles `data-power-saving` attribute on `document.documentElement`.
 */
export function usePowerSaving(): UsePowerSavingReturn {
  if (!isInitialized && typeof window !== "undefined") {
    isInitialized = true;
    refreshPowerSaving();
    window.addEventListener("cm-power-save-change", refreshPowerSaving);
    window.addEventListener("focus", refreshPowerSaving);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refreshPowerSaving();
    });
  }
  return { isPowerSaving: readonly(isPowerSaving) };
}
