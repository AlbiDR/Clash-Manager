// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { computed } from "vue";
import { useShowcaseMode } from "./useShowcaseMode";
import { useBlueprintMode } from "./useBlueprintMode";
import { useSyntheticMode } from "./useSyntheticMode";

/**
 * SYSTEM INFO SERVICE (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Provides a single source of truth for application-level metadata
 * and global display states.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * This service centralizes the resolution of the application version and
 * manages the priority logic for global UI status badges.
 *
 * Satisfies ADR Section I (Core Services) and ADR Section II (Presentation Orchestration).
 * It acts as the authoritative source for environment-aware metadata.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 (@core)
 * - **Import Boundaries:** May import from Layer 1 (@core) and Layer 0 (@substrate).
 *   Imports from Shared (@shared), Features (@features), or App (@app) are forbidden.
 */

/**
 * The static application version injected during the build process.
 * Falls back to "0.0.0" if the global constant is not defined.
 *
 * @remarks
 * [DECISION LOG] The `__APP_VERSION__` constant is injected via Vite's `define`
 * configuration during the build phase (SSOT from package.json).
 */
export const appVersion = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

/**
 * COMPOSABLE: useSystemInfo
 *
 * @remarks
 * Harmonizes system-level display logic across all views.
 *
 * @returns
 * - `appVersion`: The resolved application version string.
 * - `activeBadge`: A computed string indicating the current active specialized mode.
 */
export function useSystemInfo() {
  const { isShowcaseMode } = useShowcaseMode();
  const { isBlueprintMode } = useBlueprintMode();
  const { isSyntheticMode } = useSyntheticMode();

  /**
   * RESOLUTION: Badge Priority Queue
   *
   * @remarks
   * When multiple specialized modes are active, the UI displays only the
   * highest-priority badge in the footer to avoid clutter.
   *
   * Priority Ordering:
   * 1. SHOWCASE (Combines Blueprint and Synthetic)
   * 2. BLUEPRINT (Skeleton mode)
   * 3. SYNTHETIC (Mock data mode)
   *
   * [DECISION LOG] This priority hierarchy ensures that development/demo modes
   * are explicitly visible to the user, preventing confusion with live production data.
   *
   * [THREAT:] Multiple overlapping mode badges can occlude critical footer navigation
   * or status indicators on small viewports. The priority queue resolves this.
   */
  const activeBadge = computed(() => {
    if (isShowcaseMode.value) return "SHOWCASE";
    if (isBlueprintMode.value) return "BLUEPRINT";
    if (isSyntheticMode.value) return "SYNTHETIC";
    return "";
  });

  return {
    appVersion,
    activeBadge,
  };
}
