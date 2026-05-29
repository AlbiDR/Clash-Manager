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
import type { VoyageSummary, VoyageStatus, T2TInput } from "../types";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { 
  createSupabaseClient
} from "@core/api/SupabaseClient";
import {
  initializeVoyage as apiInitializeVoyage, 
  fetchVoyageSummary as apiFetchVoyageSummary,
  fetchVoyageContributions as apiFetchVoyageContributions,
  scheduleVoyageEvent as apiScheduleVoyageEvent,
  cancelScheduledVoyageEvent as apiCancelScheduledVoyageEvent,
  setVoyageEnd as apiSetVoyageEnd
} from "@core/api/VoyageClient";

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

  /** Realtime channel instance for listening to Postgres changes in the voyage tables. */
  let realtimeChannel: RealtimeChannel | null = null;

  // --- GETTERS ---

  /** The current status of the Voyage event (IDLE, PENDING, ACTIVE, COMPLETED). */
  const status = computed<VoyageStatus>(() =>
    summary.value?.event.status ?? "IDLE"
  );

  /** Returns true if the Voyage is currently in the ACTIVE state. */
  const isActive = computed(() => status.value === "ACTIVE");

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
  const totalCrowns = computed(() => summary.value?.total_crowns ?? 0);

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

  // --- T2T UTILITY ---

  /**
   * Converts a relative Time-to-Timestamp input into an absolute ISO-8601 string.
   *
   * @param input - The duration in days, hours, and minutes.
   * @returns An ISO-8601 timestamp string relative to the current time.
   */
  function t2tToTimestamp(input: T2TInput): string {
    const totalMs =
      input.days * 86_400_000 +
      input.hours * 3_600_000 +
      input.minutes * 60_000;
    return new Date(Date.now() + totalMs).toISOString();
  }

  // --- REALTIME ---

  /**
   * Establishes Postgres realtime listeners for the voyage tables.
   *
   * @remarks
   * Side Effects:
   * - Initializes `realtimeChannel`.
   * - Triggers `refresh()` on any change to `drivers.clan_voyage` or `drivers.clan_voyage_contributions`.
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
   *
   * @remarks
   * Satisfies ADR Section III: Validation Boundaries.
   * Uses Layer 1 SupabaseClient which enforces Valibot schemas on all inbound data.
   *
   * Side Effects:
   * - Updates `summary`, `loading`, and `lastUpdated`.
   * - Automatically manages realtime listener lifecycle based on event status.
   */
  async function refresh() {
    loading.value = true;
    try {
      const [summaryData, contributionsData] = await Promise.all([
        apiFetchVoyageSummary(),
        apiFetchVoyageContributions()
      ]);

      if (summaryData && summaryData.event) {
        summary.value = {
          event: {
            id: summaryData.event.id,
            clan_tag: summaryData.event.clan_tag,
            status: summaryData.event.status,
            target_crowns: summaryData.event.target_crowns,
            start_at: summaryData.event.start_at,
            end_at: summaryData.event.end_at,
            activated_by: null, // Optional for now
            is_victory: summaryData.progress_ratio >= 1.0,
          },
          contributions: contributionsData.map(c => ({
            player_tag: c.player_tag,
            player_name: c.player_name,
            crowns: c.crowns,
            voyage_crown_pct: Number(c.voyage_crown_pct),
            performance_score: c.performance_score ? Number(c.performance_score) : undefined
          })),
          total_crowns: summaryData.total_crowns,
          progress_ratio: summaryData.progress_ratio,
        };
        lastUpdated.value = Date.now();

        // Listen for realtime updates whenever an event is in progress
        if (summary.value.event.status === 'ACTIVE') {
          setupRealtimeListeners();
        } else if (summary.value.event.status === 'PENDING') {
          // Realtime on clan_voyage keeps clients notified when the cron promotes to ACTIVE
          setupRealtimeListeners();
        } else {
          cleanupListeners();
        }
      } else {
        summary.value = null;
        cleanupListeners();
      }
    } catch (error) {
      console.error("[Voyage] Refresh failed:", error);
    } finally {
      loading.value = false;
    }
  }

  /**
   * Schedules a new PENDING Voyage event in the future.
   *
   * @param target - The crown goal.
   * @param startsIn - Relative time when it starts.
   */
  async function scheduleVoyage(target: number, startsIn: T2TInput) {
    loading.value = true;
    try {
      const start_at = t2tToTimestamp(startsIn);
      const response = await apiScheduleVoyageEvent(target, start_at);

      if (response.success) {
        const result = response.data as { success: boolean; error?: string };
        if (result.success) {
          await refresh();
        } else {
          throw new Error(result.error ?? "Scheduling failed");
        }
      } else {
        throw new Error(String(response.error) ?? "Scheduling failed");
      }
    } catch (err: any) {
      console.error('[Voyage] Schedule action error:', err);
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Sets the end time on an already-ACTIVE Voyage event.
   *
   * @param endsIn - Relative duration from now until the event concludes.
   *
   * @remarks
   * Called after the pg_cron job auto-activates the voyage and the official
   * in-game duration is publicly announced. The backend guards against calling
   * this on a non-ACTIVE voyage.
   *
   * @throws Error if the operation fails (logic error or network/auth failure).
   */
  async function setVoyageEnd(endsIn: T2TInput) {
    const voyageId = summary.value?.event.id;
    if (!voyageId) throw new Error("No active voyage found.");

    loading.value = true;
    try {
      const end_at = t2tToTimestamp(endsIn);
      const response = await apiSetVoyageEnd(voyageId, end_at);

      if (response.success) {
        const result = response.data as { success: boolean; error?: string };
        if (result.success) {
          await refresh();
        } else {
          throw new Error(result.error ?? "Setting end time failed");
        }
      } else {
        throw new Error(String(response.error) ?? "Setting end time failed");
      }
    } catch (err: any) {
      console.error('[Voyage] Set end time error:', err);
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Cancels the currently scheduled PENDING Voyage event.
   */
  async function cancelSchedule() {
    const voyageId = summary.value?.event.id;
    if (!voyageId) throw new Error("No scheduled voyage is active.");

    loading.value = true;
    try {
      const response = await apiCancelScheduledVoyageEvent(voyageId);

      if (response.success) {
        const result = response.data as { success: boolean; error?: string };
        if (result.success) {
          await refresh();
        } else {
          throw new Error(result.error ?? "Cancellation failed");
        }
      } else {
        throw new Error(String(response.error) ?? "Cancellation failed");
      }
    } catch (err: any) {
      console.error('[Voyage] Cancel schedule action error:', err);
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Activates a new Voyage event via Supabase RPC (Direct IMMEDIATE ACTIVE).
   *
   * @param target - The crown goal for the new Voyage.
   * @param startsIn - Relative duration until the event begins.
   * @param endsIn - Relative duration until the event concludes.
   *
   * @remarks
   * Satisfies ADR Section IV: Resilience & Operational Security.
   * Delegates event initialization to a secured backend RPC.
   *
   * Side Effects:
   * - Triggers `refresh()` upon successful activation.
   * - Writes to the Supabase backend via `apiInitializeVoyage`.
   *
   * @throws Error if the activation fails (logic error or network/auth failure).
   */
  async function activateVoyage(
    target: number,
    startsIn: T2TInput,
    endsIn: T2TInput
  ) {
    loading.value = true;
    try {
      const start_at = t2tToTimestamp(startsIn);
      const end_at = t2tToTimestamp(endsIn);
      
      const response = await apiInitializeVoyage(target, start_at, end_at);
      
      if (response.success) {
        // Business logic check (the JSONB returned by the SQL)
        const result = response.data as { success: boolean; error?: string };
        
        if (result.success) {
          console.log('[Voyage] Activation successful:', result);
          await refresh();
        } else {
          console.error('[Voyage] Activation failed (logic):', result.error);
          throw new Error(result.error ?? "Activation failed");
        }
      } else {
        console.error('[Voyage] Activation failed (network/auth):', response.error);
        throw new Error(String(response.error) ?? "Activation failed");
      }
    } catch (err: any) {
      console.error('[Voyage] Action error:', err);
      throw err;
    } finally {
      loading.value = false;
    }
  }

  return {
    summary,
    loading,
    lastUpdated,
    status,
    isActive,
    startsAt,
    isPending,
    isVictory,
    progressRatio,
    totalCrowns,
    targetCrowns,
    endsAt,
    contributions,
    t2tToTimestamp,
    refresh,
    scheduleVoyage,
    setVoyageEnd,
    cancelSchedule,
    activateVoyage,
  };
});
