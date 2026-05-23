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

  const status = computed(() => ({
    type: hubHealth.value.type,
    text: hubHealth.value.label,
    nominal: hubHealth.value.type === "success",
  }));

  const statsBadge = computed(() => {
    let count: number;

    if (isShowcase.value) {
      count = Math.floor(Math.random() * 50) + 1;
    } else if (isBlueprintMode.value) {
      count =
        statsLabel === "Recruit"
          ? DEFAULT_MOCK_RECRUIT_COUNT
          : DEFAULT_MOCK_MEMBER_COUNT;
    } else {
      count = dataCount.value;
    }

    const displayLabel = count === 1 ? statsLabel : `${statsLabel}s`;

    return {
      label: displayLabel,
      value: count.toString(),
    };
  });

  return {
    status,
    statsBadge,
    metadata,
    hubHealth,
  };
}
