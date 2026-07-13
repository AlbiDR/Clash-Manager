// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { useClashDataStore } from "@core";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useConsoleController } from "@core/services/useConsoleController";
import { useBlitzMode } from "@core/services/useBlitzMode";
import { useSelectionStore } from "@core/services/useSelectionStore";
import { LEADERBOARD_SORT_OPTIONS } from "@core/utils/sortOptions";
import { LeaderboardSort } from "@core/utils/sortStrategies";
import type { LeaderboardMember } from "@core/types";

/**
 * COMPOSABLE: useLeaderboard
 *
 * @remarks
 * Specialized logic for the Leaderboard view (Roster). Orchestrates the
 * transformation of raw clan member data into a sorted, searchable, and
 * selectable list via the `useConsoleController` (@core/services).
 *
 * Following the CleanStack Architecture (Section III), this feature-level
 * composable acts as a specialized controller that configures generic core
 * infrastructure for the Roster domain.
 *
 * @returns
 * - `searchQuery`: Reactive search string for filtering by name or tag.
 * - `sortBy`: The active sorting strategy key.
 * - `visibleItems`: Paginated slice of members for the UI.
 * - `expandedIds`: Set of members with visible detail cards.
 * - `selectedIds`: Array of member tags currently in the selection buffer.
 * - `selectedSet`: Optimized Set for O(1) selection lookups.
 * - `fabState`: Orchestrated state for the Batch Action FAB.
 * - `isSelectionMode`: Boolean indicating if multi-select is active.
 * - `status`: Unified connectivity and data health status.
 * - `statsBadge`: Configuration for the list header item count.
 * - `showSkeletons`: Whether to display loading state UI.
 * - `layoutProps`: Consolidated props for the ConsoleLayout component.
 * - `layoutEvents`: Consolidated event handlers for the ConsoleLayout component.
 * - `refresh`: Triggers a manual revalidation from the backend.
 * - `updateSort`: Changes the active sorting strategy.
 * - `toggleSelect`: Toggles selection for a specific member.
 * - `toggleExpand`: Toggles the detail view for a specific member.
 * - `clearSelection`: Resets the selection buffer and exits selection mode.
 * - `handleSelectAll`: Selects all filtered members.
 * - `handleSelectScore`: Selects members exceeding a performance threshold.
 * - `getCardMetadata`: Factory for per-card UI state.
 * - `getMemoKeys`: Generates stable keys for Vue list memoization.
 *
 * @sideeffects
 * - Inherits side effects from `useConsoleController`, including UI coordination
 *   for the batch action FAB and deep-link processing on hydration.
 */
export function useLeaderboard() {
  const clashDataStore = useClashDataStore();
  const { members } = storeToRefs(clashDataStore);

  // [REFACTOR] ARCHITECTURAL ALIGNMENT: Adopt the shared Blitz pipeline so the
  // Roster FAB exposes the same Open/Blitz batch actions as Headhunter. Members
  // are not dismissible, so dismissal simply clears the selection and the
  // dismiss affordance keeps the neutral "close" icon (not Blitz's "trash").
  const selectionStore = useSelectionStore();
  const blitz = useBlitzMode(selectionStore);

  // [DECISION LOG] BLITZ INTEGRATION:
  // The Roster view adopts the same batch-action infrastructure as Headhunter.
  // This satisfies ADR Section III by ensuring consistent interaction patterns
  // for multi-member operations (e.g. mass opening profiles) across features.
  const controller = useConsoleController({
    data: members,
    filterFn: (member: LeaderboardMember) => [member.n, member.id],
    sortStrategies: LeaderboardSort,
    sortOptions: LEADERBOARD_SORT_OPTIONS,
    defaultSort: "score",
    deepLinkPrefix: "member-",
    batchIdMapper: (member: LeaderboardMember) => member.id,
    statsLabel: "Member",
    scoreGetter: (member: LeaderboardMember) => member.performanceScore || 0,
    selectionStore,
    fabState: computed(() => ({
      ...blitz.fabState.value,
      dismissIcon: "close",
    })),
    layoutEvents: computed(() => ({
      "fab-action": blitz.handleAction,
      "fab-blitz": blitz.handleBlitz,
      "clear-selection": blitz.clearSelection,
      "fab-dismiss": blitz.clearSelection,
    })),
  });

  return {
    ...controller,
  };
}
