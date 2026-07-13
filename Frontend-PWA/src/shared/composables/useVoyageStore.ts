// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * ============================================================================
 * [FEATURE] VOYAGE STORE
 * ----------------------------------------------------------------------------
 * Pinia store for the Clan Voyage event state.
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 3 (@features)
 * - **Role:** Reactive state manager for active Voyage event data.
 * - **Data Source (Mock):** Static mock data used for UI validation.
 *   Replace `MOCK_VOYAGE` and `MOCK_CONTRIBUTIONS` with live Supabase
 *   calls once backend Phase 2 is complete.
 *
 * **T2T (Time-to-Timestamp) Logic:**
 * - `t2tToTimestamp(input)` converts a `T2TInput` (D/H/M) into an absolute
 *   ISO-8601 string by adding the total seconds to `Date.now()`.
 * ============================================================================
 */
import { defineStore } from "pinia";
import { ref, computed, onUnmounted } from "vue";
import type { VoyageSummary, VoyageStatus } from "./voyageTypes";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { 
  createSupabaseClient
} from "@core/api/SupabaseClient";
import {
  fetchVoyageSummary as apiFetchVoyageSummary,
  fetchVoyageContributions as apiFetchVoyageContributions
} from "@core/api/VoyageClient";
import { useVoyageActions } from "./useVoyageActions";

export const useVoyageStore = defineStore("voyage", () => {
  /**
   * @remarks
   * Satisfies ADR Section III: State Management Hierarchy.
   * Encapsulates feature-specific state for the Clan Voyage silo.
   */

  // --- STATE ---

  /** The authoritative summary of the active Voyage, including participant contributions. */
  const summary = ref<VoyageSummary | null>(null);

  /** Indicates if a refresh or activation operation is currently in progress. */
  const loading = ref(false);

  /** Unix timestamp (ms) of the last successful state refresh. */
  const lastUpdated = ref<number>(0);

  /**
   * Realtime channel instance for listening to Postgres changes in the voyage tables.
   * // EPHEMERAL: intentionally resets on cold start.
   */
  let realtimeChannel: RealtimeChannel | null = null;

  // --- GETTERS ---

  /** The current status of the Voyage event (IDLE, PENDING, ACTIVE, COMPLETED). */
  const status = computed<VoyageStatus>(() =>
    summary.value?.event.status ?? "IDLE"
  );

  /** Returns true if the Voyage is currently in the ACTIVE state. */
  const isActive = computed(() => status.value === "ACTIVE");

  /** Returns true if the Voyage active but has no end time set yet. */
  const isAwaitingEnd = computed(() => {
    return status.value === "ACTIVE" && !summary.value?.event.end_at;
  });

  /** The scheduled start date/time of the event as a JavaScript Date object. */
  const startsAt = computed(() =>
    summary.value?.event.start_at ? new Date(summary.value.event.start_at) : null
  );

  /** Returns true if the Voyage status is PENDING and the start time is in the future. */
  const isPending = computed(() => {
    if (status.value !== "PENDING") return false;
    const start = startsAt.value;
    return start ? start.getTime() > Date.now() : false;
  });

  /** Returns true if the progress ratio has reached or exceeded 1.0 (100%). */
  const isVictory = computed(() =>
    (summary.value?.progress_ratio ?? 0) >= 1.0
  );

  /** The normalized completion ratio (0.0 to 1.0) for the current crown target. */
  const progressRatio = computed(() =>
    Math.min(summary.value?.progress_ratio ?? 0, 1.0)
  );

  /** The aggregate sum of crowns contributed by all participants. */
  const totalCrowns = computed(() => summary.value?.total_voyage_crowns ?? 0);

  /** The crown requirement for the current Voyage event. */
  const targetCrowns = computed(() =>
    summary.value?.event.target_crowns ?? 0
  );

  /** The projected end date/time of the event as a JavaScript Date object. */
  const endsAt = computed(() =>
    summary.value?.event.end_at ? new Date(summary.value.event.end_at) : null
  );

  /** List of all participant contributions, including names, crowns, and performance scores. */
  const contributions = computed(
    () => summary.value?.contributions ?? []
  );

  // --- REALTIME ---

  /**
   * Establishes Postgres realtime listeners for the voyage tables.
   */
  function setupRealtimeListeners() {
    if (realtimeChannel) return;

    const supabase = createSupabaseClient();
    
    realtimeChannel = supabase
      .channel('voyage-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'drivers', table: 'clan_voyage' },
        () => refresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'drivers', table: 'clan_voyage_contributions' },
        () => refresh()
      )
      .subscribe();
  }

  /**
   * Unsubscribes from the realtime channel and clears the local reference.
   */
  function cleanupListeners() {
    if (realtimeChannel) {
      realtimeChannel.unsubscribe();
      realtimeChannel = null;
    }
  }

  onUnmounted(() => {
    cleanupListeners();
  });

  // --- ACTIONS ---

  /**
   * Authoritative fetch of the voyage state and performance aggregates.
   */
  async function refresh() {
    loading.value = true;
    try {
      // [THREAT:] Anemic variable pathogens (Target C) can mask structural intent.
      // [DECISION LOG] Renamed to domain-descriptive terms to align with CleanStack standards.
      const [voyageSummarySnapshot, contributionLedgerSnapshot] = await Promise.all([
        apiFetchVoyageSummary(),
        apiFetchVoyageContributions()
      ]);

      if (voyageSummarySnapshot && voyageSummarySnapshot.event) {
        summary.value = {
          event: {
            id: voyageSummarySnapshot.event.id,
            clan_tag: voyageSummarySnapshot.event.clan_tag,
            status: voyageSummarySnapshot.event.status,
            target_crowns: voyageSummarySnapshot.event.target_crowns,
            start_at: voyageSummarySnapshot.event.start_at,
            end_at: voyageSummarySnapshot.event.end_at,
            activated_by: null,
            is_victory: voyageSummarySnapshot.progress_ratio >= 1.0,
          },
          contributions: contributionLedgerSnapshot.map(contributionCandidate => ({
            player_tag: contributionCandidate.player_tag,
            player_name: contributionCandidate.player_name,
            total_voyage_crowns: contributionCandidate.total_voyage_crowns,
            percentage_voyage_crowns: Number(contributionCandidate.percentage_voyage_crowns),
            performance_score: contributionCandidate.performance_score ? Number(contributionCandidate.performance_score) : undefined
          })),
          total_voyage_crowns: voyageSummarySnapshot.total_voyage_crowns,
          progress_ratio: voyageSummarySnapshot.progress_ratio,
        };
        lastUpdated.value = Date.now();

        if (summary.value.event.status === 'ACTIVE' || summary.value.event.status === 'PENDING') {
          setupRealtimeListeners();
        } else {
          cleanupListeners();
        }
      } else {
        summary.value = null;
        cleanupListeners();
      }
    } catch (voyageRefreshError: unknown) {
      // [THREAT:] Silent failures in state hydration (Target C).
      // [DECISION LOG] Explicitly catching and logging state hydration errors.
      const errorMessage = voyageRefreshError instanceof Error ? voyageRefreshError.message : String(voyageRefreshError);
      console.error("[Voyage] Refresh failed:", errorMessage);
    } finally {
      loading.value = false;
    }
  }

  // Compose actions from externalized logic
  const {
    scheduleVoyage,
    setVoyageEnd,
    cancelSchedule,
    activateVoyage
  } = useVoyageActions(summary, loading, refresh);

  return {
    summary,
    loading,
    lastUpdated,
    status,
    isActive,
    isAwaitingEnd,
    startsAt,
    isPending,
    isVictory,
    progressRatio,
    totalCrowns,
    targetCrowns,
    endsAt,
    contributions,
    refresh,
    scheduleVoyage,
    setVoyageEnd,
    cancelSchedule,
    activateVoyage,
  };
});
