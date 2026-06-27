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
 * countdown timers and progress normalization. It acts as a Layer 3 feature-level
 * orchestrator that transforms raw store state into UI-ready reactive primitives.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 3 Feature Composable (@features)
 * - **Role:** Presentation logic orchestrator for Voyage feedback surfaces.
 * - **Satisfaction:** ADR Section III (Data Flow - Orchestration) and Section V (UI/UX).
 *
 * @param options - Configuration for the countdown display.
 * @param options.showDays - Whether to include days in the formatted countdown string.
 *
 * @returns Object containing:
 * - `timeRemaining`: Formatted countdown until the current voyage ends.
 * - `startsInCountdown`: Formatted countdown until the next voyage begins.
 * - `progressPercent`: The current voyage progress as a rounded integer (0-100).
 * - `store`: The underlying Voyage Pinia store instance.
 */
export function useVoyageStatus(options: { showDays?: boolean } = {}) {
  const store = useVoyageStore();

  // [THREAT:] Redundant interval instantiation can lead to performance degradation on low-end devices.
  // [DECISION LOG] Centralizing countdown orchestration ensures synchronized UI updates and
  // consistent expiration behavior (auto-refresh) across all Voyage feedback components.
  const timeRemaining = useCountdown(computed(() => store.endsAt), {
    showDays: options.showDays,
    onExpiry: () => store.refresh()
  });

  const startsInCountdown = useCountdown(computed(() => store.startsAt), {
    showDays: options.showDays,
    onExpiry: () => store.refresh()
  });

  // [DECISION LOG] Normalizing progress to a rounded percentage satisfies the UI contract for
  // progress bar components while abstracting the underlying store's decimal ratio.
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
