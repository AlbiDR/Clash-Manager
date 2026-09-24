// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref, type Ref } from "vue";
import {
  MOTION_STORAGE_KEY,
  resolveMotionPreference,
  type MotionPreference,
} from "../../core/theme/motionContract";

export type { MotionPreference };

/**
 * Return contract for the `useMotionPreference` composable.
 */
export interface UseMotionPreferenceReturn {
  /** Reactive state representing active motion preference ('system' | 'reduced' | 'standard'). */
  motionPreference: Ref<MotionPreference>;
  /**
   * Persists and applies an explicit user-selected motion preference.
   *
   * @param nextPreference - Selected motion preference setting.
   */
  setMotionPreference: (nextPreference: MotionPreference) => void;
  /**
   * Initializes motion preference from LocalStorage or system fallback.
   * Safe for repeated calls (idempotent).
   */
  init: () => void;
}

const motionPreference = ref<MotionPreference>("system");
const isInitialized = ref(false);

/**
 * COMPOSABLE: useMotionPreference
 *
 * A Layer 2 browser-preference broker. The operating system remains the
 * default authority; a deliberate local setting can reduce motion further or
 * restore the app's standard, token-driven motion language.
 *
 * @remarks
 * Satisfies CleanStack Architecture ADR Section I & II: Motion & Theme Contract.
 * Provides idempotent initialization and persistence for reduced motion accessibility preferences.
 *
 * @returns Object conforming to `UseMotionPreferenceReturn`.
 *
 * @sideeffects
 * - MUTATES `document.documentElement` attribute `data-motion-preference`.
 * - WRITES to `localStorage` key `cm_motion_preference`.
 */
export function useMotionPreference(): UseMotionPreferenceReturn {
  // [DECISION LOG] DOM ATTRIBUTES FOR CSS MOTION TARGETING
  // CSS targets `[data-motion-preference]` selectors on root documentElement.
  // SSR boundary check avoids window/document access errors during pre-rendering.
  function applyMotionPreference() {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-motion-preference", motionPreference.value);
  }

  // [DECISION LOG] EXPLICIT OVERRIDE PERSISTENCE
  // User selection overrides OS default and persists across browser reloads.
  function setMotionPreference(nextPreference: MotionPreference) {
    motionPreference.value = nextPreference;
    localStorage.setItem(MOTION_STORAGE_KEY, nextPreference);
    applyMotionPreference();
  }

  // [DECISION LOG] SINGLE-EXECUTION INITIALIZATION IDEMPOTENCY
  // Prevents duplicate LocalStorage reads and redundant DOM mutations on component re-mounts.
  function init() {
    if (isInitialized.value || typeof window === "undefined") return;

    motionPreference.value = resolveMotionPreference(localStorage.getItem(MOTION_STORAGE_KEY));
    applyMotionPreference();
    isInitialized.value = true;
  }

  return {
    motionPreference,
    setMotionPreference,
    init,
  };
}
