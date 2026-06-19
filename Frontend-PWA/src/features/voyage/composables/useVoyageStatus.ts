// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { computed } from "vue";
import { useVoyageStore } from "./useVoyageStore";
import { useCountdown } from "@shared";

/**
 * COMPOSABLE: useVoyageStatus
 *
 * @remarks
 * Centralizes the live status tracking for Clan Voyage events, including
 * countdown timers and progress normalization.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 3 Feature Composable (@features)
 * - **Role:** Presentation logic orchestrator for Voyage feedback surfaces.
 */
export function useVoyageStatus(options: { showDays?: boolean } = {}) {
  const store = useVoyageStore();

  const timeRemaining = useCountdown(computed(() => store.endsAt), {
    showDays: options.showDays,
    onExpiry: () => store.refresh()
  });

  const startsInCountdown = useCountdown(computed(() => store.startsAt), {
    showDays: options.showDays,
    onExpiry: () => store.refresh()
  });

  const progressPercent = computed(() =>
    Math.round(store.progressRatio * 100)
  );

  return {
    timeRemaining,
    startsInCountdown,
    progressPercent,
    store
  };
}
