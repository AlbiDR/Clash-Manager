// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref, nextTick } from "vue";
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
 * **Architectural Context:**
 * - **Layer:** Layer 1 (@core)
 * - **Import Boundaries:** May import from Layer 1 (@core) and Layer 0 (@substrate).
 *   Imports from Shared (@shared), Features (@features), or App (@app) are forbidden.
 */

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
 * @returns
 * - `expandedIds`: Reactive Set of IDs that are currently expanded in the UI.
 * - `toggleExpand`: Function to add/remove an ID from the expansion set.
 * - `processDeepLink`: Function to evaluate the current route and trigger expansion/scroll.
 */
export function useDeepLinkHandler(domIdPrefix: string) {
  const route = useRoute();
  const expandedIds = ref<Set<string>>(new Set());

  // Stability: Prevent re-triggering scroll on background data refreshes.
  // Rationale: We only want to auto-scroll when the user first lands or manually refreshes.
  const deepLinkHandled = ref(false);

  /**
   * Toggles the expansion state of a specific item.
   *
   * @param id - The unique identifier of the item to toggle.
   */
  function toggleExpand(id: string) {
    const newSet = new Set(expandedIds.value);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    expandedIds.value = newSet;
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
  function processDeepLink(items: readonly { id: string }[]) {
    // Only run once per session/reload to avoid jarring resets.
    if (deepLinkHandled.value) return;

    const pinId = route.query.pin as string | undefined;

    // Check if the pinned ID exists in the current dataset.
    if (pinId && items.some((item) => item.id === pinId)) {
      const newSet = new Set(expandedIds.value);
      newSet.add(pinId);
      expandedIds.value = newSet;

      deepLinkHandled.value = true; // Mark handled

      nextTick(() => {
        const el = document.getElementById(`${domIdPrefix}${pinId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          // Highlight the element briefly? (Optional future optimization)
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
