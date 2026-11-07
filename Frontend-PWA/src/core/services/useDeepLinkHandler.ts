// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref, nextTick, type Ref } from "vue";
import { useRoute } from "vue-router";

/**
 * DEEP LINK HANDLER SERVICE (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Manages item expansion and auto-scroll based on URL query parameters.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * This service centralizes the logic for handling "pinned" items via deep links.
 * It ensures that when a user arrives via a URL containing a specific item ID,
 * that item is automatically expanded and scrolled into view.
 *
 * Satisfies CleanStack Architecture ADR Section I: Core Services and ADR Section II:
 * Presentation Orchestration. Decouples navigation-driven DOM interaction and
 * item expansion from monolithic feature views.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 (@core)
 * - **Import Boundaries:** May import from Layer 1 (@core) and Layer 0 (@substrate).
 *   Imports from Shared (@shared), Features (@features), or App (@app) are forbidden.
 */

/**
 * Shape of items evaluated by {@link UseDeepLinkHandlerReturn.processDeepLink}.
 */
export interface DeepLinkTargetItem {
  /** Unique entity identifier matching candidate URL pin parameters. */
  id: string;
}

/**
 * Return contract for the {@link useDeepLinkHandler} composable.
 */
export interface UseDeepLinkHandlerReturn {
  /** Reactive Set containing identifiers of currently expanded UI cards. */
  expandedIds: Ref<Set<string>>;
  /** Toggles expansion state for an individual item by its unique identifier. */
  toggleExpand: (targetItemId: string) => void;
  /** Evaluates route query parameters against candidate items and triggers auto-expansion/scroll. */
  processDeepLink: (items: readonly DeepLinkTargetItem[]) => void;
}

/**
 * COMPOSABLE: useDeepLinkHandler
 *
 * @remarks
 * Orchestrates deep-link navigation for list-based views (Roster, Headhunter).
 * Implements a "run-once" guard to prevent layout jumps during background
 * data refreshes.
 *
 * @param domIdPrefix - A string prefix used to construct the DOM ID for scrolling (e.g., 'member-').
 *
 * @returns {@link UseDeepLinkHandlerReturn} containing reactive state and action handlers:
 * - `expandedIds`: Reactive Set of IDs that are currently expanded in the UI.
 * - `toggleExpand`: Function to add/remove an ID from the expansion set.
 * - `processDeepLink`: Function to evaluate the current route and trigger expansion/scroll.
 *
 * @sideeffects
 * - Mutates local `expandedIds` reactive Set upon user toggle or deep-link match.
 * - Reads `route.query.pin` on invocation of `processDeepLink`.
 * - Schedules asynchronous DOM query and smooth auto-scroll via `nextTick` and `Element.scrollIntoView`.
 */
export function useDeepLinkHandler(domIdPrefix: string): UseDeepLinkHandlerReturn {
  const route = useRoute();
  const expandedIds = ref<Set<string>>(new Set());

  // [GUARD] Stability: Prevent re-triggering scroll on background data refreshes.
  // [DECISION LOG] Run-Once Guard: We only want to auto-scroll when the user first lands
  // or manually navigates to the URL. Background data revalidation (SWR) must not jar
  // user viewport position or re-trigger animations.
  const deepLinkHandled = ref(false);

  /**
   * Toggles the expansion state of a specific item.
   *
   * @remarks
   * Creates a new `Set` instance to guarantee Vue reactivity triggers across observers.
   *
   * @param targetItemId - The unique identifier of the item to toggle.
   */
  function toggleExpand(targetItemId: string): void {
    // [DECISION LOG] Set Copy Reactivity: Vue 3 ref(Set) mutation detection requires
    // either triggering .value trigger or replacing the reference. Constructing a new Set
    // guarantees deterministic reactive updates in all subscriber components.
    const updatedExpandedSet = new Set(expandedIds.value);
    if (updatedExpandedSet.has(targetItemId)) {
      updatedExpandedSet.delete(targetItemId);
    } else {
      updatedExpandedSet.add(targetItemId);
    }
    expandedIds.value = updatedExpandedSet;
  }

  /**
   * Evaluates the 'pin' query parameter and triggers UI updates if a match is found.
   *
   * @remarks
   * This function should be called when the primary data set is loaded.
   * It is guarded by `deepLinkHandled` to ensure it only fires once per lifecycle.
   *
   * @param items - The collection of items to search for the pinned ID.
   */
  function processDeepLink(items: readonly DeepLinkTargetItem[]): void {
    // [GUARD] Single-shot execution guard per lifecycle to prevent jarring resets.
    if (deepLinkHandled.value) return;

    // [THREAT:] Parameter Type Spoofing. Route query values can be string, array of strings,
    // or undefined. We normalize array parameters to the first element to avoid false negative checks.
    const rawPinnedId = route.query.pin;
    const pinnedId = Array.isArray(rawPinnedId) ? rawPinnedId[0] : rawPinnedId;

    // [GUARD] Boundary check: Verify candidate pinned identifier exists in active dataset.
    // [THREAT:] Phantom DOM Element Queries: Attempting to scroll to non-existent DOM elements
    // when a stale or invalid URL query parameter is supplied.
    if (pinnedId && items.some((candidateItem) => candidateItem.id === pinnedId)) {
      const updatedExpandedSet = new Set(expandedIds.value);
      updatedExpandedSet.add(pinnedId);
      expandedIds.value = updatedExpandedSet;

      // [DECISION LOG] Mark handled immediately before DOM query to prevent race conditions
      // if processDeepLink is invoked concurrently during dataset streaming.
      deepLinkHandled.value = true;

      // [DECISION LOG] Layout Settling: Defer DOM query until nextTick to ensure Vue has
      // rendered the newly expanded card element in the DOM before calculating scroll geometry.
      nextTick(() => {
        const targetElement = document.getElementById(`${domIdPrefix}${pinnedId}`);
        if (targetElement) {
          // [THREAT:] Layout Thrashing: Smooth center-block scroll avoids abrupt viewport jumps
          // on mobile viewports while accounting for fixed header/footer docking.
          targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
    }
  }

  return {
    expandedIds,
    toggleExpand,
    processDeepLink,
  };
}
