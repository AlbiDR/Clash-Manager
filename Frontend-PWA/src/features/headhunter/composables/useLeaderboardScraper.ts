// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref } from "vue";
import { useSelectionStore } from "@core/services/useSelectionStore";
import { useUiCoordinator } from "@core/services/useUiCoordinator";
import { useToast } from "@core/services/useToast";
import { useHaptics } from "@shared";
import { scoutLeaderboard } from "@core/api/RecruitClient";

/**
 * COMPOSABLE: useLeaderboardScraper
 *
 * @remarks
 * Orchestrates the dynamic, transient harvesting of clanless players from the
 * Clash Royale global and local leaderboards. Feeds candidates directly into
 * the selection store to trigger Blitz recruitment loops without database writes.
 *
 * **Architectural Context:**
 * - Layer: Layer 3 (@features/headhunter)
 * - Responsibility: Transient leaderboards scraping and queue injection.
 *
 * Satisfies ADR Section II: Structural Unitary Architecture (Layer 3 Feature isolation)
 * and ADR Section III: Data Flow & Transactional Integrity (Validation Boundaries).
 *
 * @param selectionStore - The authoritative selection store for the feature.
 * @param onBlitzTrigger - Callback to initiate the recruitment Blitz sequence.
 * @returns State and actions for managing the leaderboard harvest lifecycle.
 *
 * @sideeffects
 * - Updates the Global FAB state via `useUiCoordinator`.
 * - Triggers haptic feedback via `useHaptics`.
 * - Displays toast notifications via `useToast`.
 */
export function useLeaderboardScraper(
  selectionStore: ReturnType<typeof useSelectionStore>,
  onBlitzTrigger: () => void
) {
  const { selectAll, clearSelection } = selectionStore;
  const { updateFabState } = useUiCoordinator();
  const { info, error } = useToast();
  const haptics = useHaptics();

  const activeController = ref<AbortController | null>(null);

  /**
   * Aborts the active fetch operation and restores UI states.
   *
   * @remarks
   * Performs clean cancellation of the AbortController and resets the FAB
   * to its idle state.
   */
  function abortHarvest() {
    if (activeController.value) {
      activeController.value.abort();
      activeController.value = null;
      
      updateFabState({
        isHarvesting: false,
        activeHarvester: null,
      });
      
      haptics.tap();
      info("Harvest operation aborted");
    }
  }

  /**
   * Executes the player harvest process from the specified leaderboard endpoint.
   *
   * @remarks
   * Communicates with the `query-royale-api` Edge Function to retrieve
   * leaderboard data. Results are filtered for clanless players and
   * injected directly into the selection store.
   *
   * @param mode - The target query scope ("local" or "global").
   */
  async function executeHarvest(mode: "local" | "global") {
    if (activeController.value) return;

    haptics.tap();
    activeController.value = new AbortController();

    updateFabState({
      isHarvesting: true,
      activeHarvester: mode,
      onAbortHarvest: abortHarvest,
    });

    try {
      const payload = await scoutLeaderboard(
        mode,
        activeController.value.signal,
      );

      const rawItems = payload.items;
      const region = payload.region;

      // [DECISION LOG] CLANLESS FILTERING
      // Rationale: Only players without a clan are viable recruitment targets.
      // We filter these out before they ever reach the selection store to
      // minimize noise in the Blitz recruitment loop.
      const clanlessPlayers = rawItems.filter((harvestedPlayer) => !harvestedPlayer.clan);

      if (clanlessPlayers.length === 0) {
        info(`Harvest complete: zero clanless players found on the ${region} leaderboard.`);
        updateFabState({
          isHarvesting: false,
          activeHarvester: null,
        });
        activeController.value = null;
        return;
      }

      // [DECISION LOG] TAG SANITIZATION
      // Rationale: Standardizing on tags without the leading hash ensures consistency
      // across the selection store, local lookups, and future database writes.
      const sanitizedTags = clanlessPlayers.map((harvestedPlayer) => harvestedPlayer.tag.replace(/^#/, ""));

      clearSelection();
      selectAll(sanitizedTags);

      haptics.tap();
      info(`Successfully harvested ${sanitizedTags.length} recruits from ${region} leaderboard.`);

      // Trigger the recruitment Blitz sequence immediately
      onBlitzTrigger();
    } catch (harvestError: unknown) {
      if (harvestError instanceof Error && harvestError.name === "AbortError") {
        return;
      }
      const errorMessage = harvestError instanceof Error ? harvestError.message : "Failed to harvest leaderboard players";
      error(errorMessage);
    } finally {
      updateFabState({
        isHarvesting: false,
        activeHarvester: null,
      });
      activeController.value = null;
    }
  }

  return {
    executeHarvest,
    abortHarvest,
  };
}
