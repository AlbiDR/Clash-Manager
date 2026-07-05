// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { computed, type Ref, type ComputedRef } from "vue";
import { useConnectivityManager } from "./useConnectivityManager";
import { useShowcaseMode } from "./useShowcaseMode";
import { useBlueprintMode } from "./useBlueprintMode";
import { DEFAULT_MOCK_MEMBER_COUNT, DEFAULT_MOCK_RECRUIT_COUNT } from "@core/utils/mockData";

/**
 * COMPOSABLE: useConsoleMetadata
 *
 * @remarks
 * Extracts connectivity status and statistics badge logic from the monolithic
 * useConsoleController. This facilitates Layer 1 architectural purity.
 *
 * Satisfies ADR Section I (Core Services) and ADR Section II (Presentation Orchestration).
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 (@core)
 * - **Import Boundaries:** Restricted to Layer 1 services and Layer 0 utilities.
 *
 * @param statsLabel - Singular display label for the item type (e.g., 'Member').
 * @param dataCount - Reactive count of the current dataset.
 * @returns
 * - `status`: Tiered system health status (text/type).
 * - `statsBadge`: Item counter for the header.
 * - `metadata`: Raw connectivity metadata.
 * - `hubHealth`: Detailed health diagnostics.
 */
export function useConsoleMetadata(
  statsLabel: string,
  dataCount: ComputedRef<number> | Ref<number>,
) {
  const { isShowcaseMode: isShowcase } = useShowcaseMode();
  const { isBlueprintMode } = useBlueprintMode();
  const { hubHealth, metadata } = useConnectivityManager();

  /**
   * Derived health status for the console header.
   *
   * @remarks
   * Maps complex `HubHealth` states into a simplified format for header pills.
   */
  const status = computed(() => ({
    type: hubHealth.value.type,
    text: hubHealth.value.label,
    nominal: hubHealth.value.type === "success",
  }));

  /**
   * Header badge configuration containing the item count and label.
   *
   * @remarks
   * [DECISION LOG] Implements logic to handle Showcase and Blueprint modes
   * by providing synthetic counts that match the visual expectations of those modes.
   */
  const statsBadge = computed(() => {
    let itemCount: number;

    // [THREAT:] Anemic or mismatched counts in demo modes can undermine
    // stakeholder confidence during UI reviews.
    if (isShowcase.value) {
      itemCount = Math.floor(Math.random() * 50) + 1;
    } else if (isBlueprintMode.value) {
      itemCount =
        statsLabel === "Recruit"
          ? DEFAULT_MOCK_RECRUIT_COUNT
          : DEFAULT_MOCK_MEMBER_COUNT;
    } else {
      itemCount = dataCount.value;
    }

    const badgeLabel = itemCount === 1 ? statsLabel : `${statsLabel}s`;

    return {
      label: badgeLabel,
      value: itemCount.toString(),
    };
  });

  return {
    status,
    statsBadge,
    metadata,
    hubHealth,
  };
}
