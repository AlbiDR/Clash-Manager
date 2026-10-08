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
import { ref, computed } from "vue";
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

/**
 * STORE: useVoyageStore
 *
 * @remarks
 * Authoritative Pinia store for managing Clan Voyage event lifecycle, realtime postgres subscriptions,
 * participant contribution tracking, and scheduled events.
 *
 * [ARCHITECTURE] ADR LAYER: @features (Layer 3)
 * - Satisfies ADR Section III: State Management Hierarchy.
 * - Permitted Imports: @core services, @shared composables, Vue reactivity, Pinia.
 *
 * @returns
 * - `summary`: Reactive snapshot of active Voyage event and member contributions.
 * - `loading`: Boolean ref indicating if a refresh or event mutation is in progress.
 * - `lastUpdated`: Timestamp (ms) of the last successful state refresh.
 * - `status`: Computed Voyage status (`IDLE` | `PENDING` | `ACTIVE` | `COMPLETED`).
 * - `isActive`: Computed boolean indicating if the event is currently active.
 * - `isAwaitingEnd`: Computed boolean indicating if the event is active but lacks an end timestamp.
 * - `startsAt`: Computed Date object representing scheduled start time.
 * - `isPending`: Computed boolean indicating if the event is pending and scheduled for the future.
 * - `isVictory`: Computed boolean indicating if progress ratio reached or exceeded 1.0 (100%).
 * - `progressRatio`: Computed completion ratio normalized to [0.0, 1.0].
 * - `totalCrowns`: Computed aggregate crowns earned by all clan members during event.
 * - `targetCrowns`: Computed crown requirement target.
 * - `endsAt`: Computed Date object representing projected end time.
 * - `contributions`: Computed array of member contributions.
 * - `refresh`: Asynchronous function triggering state fetch and realtime subscription setup.
 * - `scheduleVoyage`: Action to schedule a new voyage event.
 * - `setVoyageEnd`: Action to record voyage end timestamp.
 * - `cancelSchedule`: Action to cancel a scheduled voyage event.
 * - `activateVoyage`: Action to activate a scheduled voyage event.
 *
 * @sideeffects
 * - Establishes and unsubscribes Postgres changes on Supabase realtime channel `voyage-updates`.
 * - Mutates local Pinia reactive state (`summary`, `loading`, `lastUpdated`).
 * - Executes Supabase RPC network requests via `@core/api/VoyageClient`.
 */
export const useVoyageStore = defineStore("voyage", () => {

  // --- STATE ---

  /** The authoritative summary of the active Voyage, including participant contributions. */
  const summary = ref<VoyageSummary | null>(null);

  /** Indicates if a refresh or activation operation is currently in progress. */
  const loading = ref(false);

  /** Unix timestamp (ms) of the last successful state refresh. */
  const lastUpdated = ref<number>(0);

  /** A refresh pass and the promise callers use to await that pass. */
  type RefreshPass = { promise: Promise<void>; resolve: () => void };
  let activeRefreshPass: RefreshPass | null = null;
  let queuedRefreshPass: RefreshPass | null = null;

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
   * Establishes Postgres realtime listeners for the voyage tables (`clan_voyage`, `clan_voyage_contributions`).
   *
   * @remarks
   * Automatically triggered when the active voyage is in `ACTIVE` or `PENDING` status.
   *
   * [THREAT] Prevents duplicate channel subscriptions by checking existing `realtimeChannel` reference.
   */
  function setupRealtimeListeners() {
    if (realtimeChannel) return;

    const supabase = createSupabaseClient();
    
    // [DECISION] Subscribe to postgres changes across both event metadata and player contribution ledgers.
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
   *
   * @remarks
   * Deliberately not tied to a component's `onUnmounted`: this store is an
   * app-wide singleton whose `setup()` body runs exactly once, on whichever
   * component happens to trigger its lazy first instantiation. Attaching
   * `onUnmounted` here would couple channel cleanup to that arbitrary
   * component's lifecycle instead of the voyage's actual domain state, and
   * would never fire again afterward. `refresh()` already tears the channel
   * down once the event leaves ACTIVE/PENDING, which is the correct signal.
   */
  function cleanupListeners() {
    if (realtimeChannel) {
      realtimeChannel.unsubscribe();
      realtimeChannel = null;
    }
  }

  // --- ACTIONS ---

  /**
   * Factory function creating an isolated refresh pass queue token.
   *
   * @returns RefreshPass token containing the promise and its explicit resolve trigger.
   */
  function createRefreshPass(): RefreshPass {
    let resolve!: () => void;
    const promise = new Promise<void>((resolvePromise) => {
      resolve = resolvePromise;
    });
    return { promise, resolve };
  }

  /**
   * Executes a single voyage state refresh pass fetching summary and contributions in parallel.
   *
   * @param refreshPass - The current active refresh pass token to resolve upon completion.
   *
   * @remarks
   * [THREAT] Employs single-flight queuing (`activeRefreshPass` and `queuedRefreshPass`) to prevent
   * concurrent network request thundering herd when multiple realtime events fire in rapid succession.
   */
  function loadVoyageRefreshPass(refreshPass: RefreshPass): void {
    activeRefreshPass = refreshPass;
    loading.value = true;

    void (async () => {
      // [PERF] Parallel execution of summary and contribution network RPCs for fast state convergence.
      const [summaryResult, contributionResult] = await Promise.allSettled([
        apiFetchVoyageSummary(),
        apiFetchVoyageContributions(),
      ] as const);

      if (summaryResult.status === "rejected" || contributionResult.status === "rejected") {
        // [THREAT] Gracefully handles individual network RPC failures without throwing unhandled promise rejections.
        const refreshFailure = summaryResult.status === "rejected"
          ? summaryResult.reason
          : contributionResult.status === "rejected"
            ? contributionResult.reason
            : new Error("Voyage refresh failed");
        const errorMessage = refreshFailure instanceof Error ? refreshFailure.message : String(refreshFailure);
        console.error("[Voyage] Refresh failed:", errorMessage);
        return;
      }

      const voyageSummarySnapshot = summaryResult.value;
      const contributionLedgerSnapshot = contributionResult.value;
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
    })().catch((voyageRefreshError: unknown) => {
      const errorMessage = voyageRefreshError instanceof Error ? voyageRefreshError.message : String(voyageRefreshError);
      console.error("[Voyage] Refresh failed:", errorMessage);
    }).finally(() => {
      refreshPass.resolve();
      if (queuedRefreshPass) {
        const nextRefreshPass = queuedRefreshPass;
        queuedRefreshPass = null;
        loadVoyageRefreshPass(nextRefreshPass);
      } else {
        activeRefreshPass = null;
        loading.value = false;
      }
    });
  }

  /**
   * Authoritative fetch of the voyage state and performance aggregates.
   *
   * @returns A promise that resolves when the current or queued refresh pass finishes.
   */
  function refresh(): Promise<void> {
    if (activeRefreshPass) {
      if (!queuedRefreshPass) queuedRefreshPass = createRefreshPass();
      return queuedRefreshPass.promise;
    }

    const refreshPass = createRefreshPass();
    loadVoyageRefreshPass(refreshPass);
    return refreshPass.promise;
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
