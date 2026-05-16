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
  initializeVoyage as apiInitializeVoyage, 
  fetchVoyageSummary as apiFetchVoyageSummary,
  fetchVoyageContributions as apiFetchVoyageContributions,
  createSupabaseClient 
} from "@core/api/SupabaseClient";

export const useVoyageStore = defineStore("voyage", () => {
  // --- STATE ---
  const summary = ref<VoyageSummary | null>(null);
  const loading = ref(false);
  const lastUpdated = ref<number>(0);
  let realtimeChannel: RealtimeChannel | null = null;

  // --- GETTERS ---

  const status = computed<VoyageStatus>(() =>
    summary.value?.event.status ?? "IDLE"
  );

  const isActive = computed(() => status.value === "ACTIVE");

  const isVictory = computed(() =>
    (summary.value?.progress_ratio ?? 0) >= 1.0
  );

  const progressRatio = computed(() =>
    Math.min(summary.value?.progress_ratio ?? 0, 1.0)
  );

  const totalCrowns = computed(() => summary.value?.total_crowns ?? 0);

  const targetCrowns = computed(() =>
    summary.value?.event.target_crowns ?? 0
  );

  const endsAt = computed(() =>
    summary.value?.event.end_at ? new Date(summary.value.event.end_at) : null
  );

  const contributions = computed(
    () => summary.value?.contributions ?? []
  );

  // --- T2T UTILITY ---

  function t2tToTimestamp(input: T2TInput): string {
    const totalMs =
      input.days * 86_400_000 +
      input.hours * 3_600_000 +
      input.minutes * 60_000;
    return new Date(Date.now() + totalMs).toISOString();
  }

  // --- REALTIME ---

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
      const [summaryData, contributionsData] = await Promise.all([
        apiFetchVoyageSummary(),
        apiFetchVoyageContributions()
      ]);

      if (summaryData) {
        summary.value = {
          event: {
            id: summaryData.id,
            clan_tag: summaryData.clan_tag,
            status: summaryData.status,
            target_crowns: summaryData.target_crowns,
            start_at: summaryData.start_at,
            end_at: summaryData.end_at,
            activated_by: null, // Optional for now
            is_victory: summaryData.progress_ratio >= 1.0,
          },
          contributions: contributionsData.map(c => ({
            player_tag: c.player_tag,
            crowns: c.crowns,
            performance_score: Number(c.performance_score)
          })),
          total_crowns: summaryData.total_crowns,
          progress_ratio: summaryData.progress_ratio,
        };
        lastUpdated.value = Date.now();

        if (summary.value.event.status === 'ACTIVE') {
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
   * Activates a new Voyage event via Supabase RPC.
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
    isVictory,
    progressRatio,
    totalCrowns,
    targetCrowns,
    endsAt,
    contributions,
    t2tToTimestamp,
    refresh,
    activateVoyage,
  };
});
