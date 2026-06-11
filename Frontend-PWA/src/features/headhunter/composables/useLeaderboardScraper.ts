// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref } from "vue";
import { useSelectionStore } from "@core/services/useSelectionStore";
import { useUiCoordinator } from "@core/services/useUiCoordinator";
import { useToast } from "@core/services/useToast";
import { useHaptics } from "@core/services/useHaptics";
import { getSupabaseUrl, getSupabaseKey } from "@core/api/SupabaseClient";

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
      const functionUrl = `${getSupabaseUrl()}/functions/v1/query-royale-api`;
      const response = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${getSupabaseKey()}`,
        },
        body: JSON.stringify({ endpoint: mode }),
        signal: activeController.value.signal,
      });

      if (!response.ok) {
        const errorDetails = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(errorDetails.error ?? `Query failed with status ${response.status}`);
      }

      const responseEnvelope = await response.json();
      const payload = responseEnvelope.data || responseEnvelope;

      const rawItems = payload.items || [];
      const region = payload.region || "Unknown";

      // Filter for clanless players (where the clan object is absent or null)
      const clanlessPlayers = rawItems.filter((player: any) => !player.clan);

      if (clanlessPlayers.length === 0) {
        info(`Harvest complete: zero clanless players found on the ${region} leaderboard.`);
        updateFabState({
          isHarvesting: false,
          activeHarvester: null,
        });
        activeController.value = null;
        return;
      }

      // Convert player tags to the standard format (without the leading hash symbol)
      const sanitizedTags = clanlessPlayers.map((player: any) => player.tag.replace(/^#/, ""));

      clearSelection();
      selectAll(sanitizedTags);

      haptics.tap();
      info(`Successfully harvested ${sanitizedTags.length} recruits from ${region} leaderboard.`);

      // Trigger the recruitment Blitz sequence immediately
      onBlitzTrigger();
    } catch (err: any) {
      if (err.name === "AbortError") {
        return;
      }
      error(err.message || "Failed to harvest leaderboard players");
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
