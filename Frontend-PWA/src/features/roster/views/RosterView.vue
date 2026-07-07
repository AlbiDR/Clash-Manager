<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
/**
 * ============================================================================
 * [FEATURE] ROSTER VIEW
 * ----------------------------------------------------------------------------
 * The primary interface for clan management and performance tracking.
 * Coordinates the display of the Leaderboard using the ConsoleLayout primitive.
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 3 (@features)
 * - **Role:** Presentation & Interaction Orchestrator for the Roster domain.
 * - **Dependency:** Relies on the `useLeaderboard` local orchestrator (Layer 3),
 *   which itself delegates to the `useConsoleController` (Layer 1).
 *
 * **Performance Strategy:**
 * - **v-memo Optimization:** Utilizes primitive status flags from `getCardMetadata`
 *   to ensure stable, shallow equality checks. This prevents expensive DOM
 *   re-renders of the 50-item list during global state updates.
 *
 * **Data Loading Strategy (Vue Router 5):**
 * - `useClashDataLoader` is declared as a named export so the `DataLoaderPlugin`
 *   discovers it during navigation and coordinates its lifecycle automatically.
 * - `lazy: true` preserves Stale-While-Revalidate: the view renders immediately
 *   from the IndexedDB cache while the Supabase refresh runs in the background.
 * ============================================================================
 */
import { defineBasicLoader } from "vue-router/experimental";
import {
  ConsoleLayout,
  ConsoleList
} from "@shared";
import { hydrateClashData } from "@core";
import { useLeaderboard } from "../composables/useLeaderboard";
import { MemberCard } from "../components";
import { VoyageBanner } from "@shared";

/**
 * Route data loader - exported so the DataLoaderPlugin can discover it.
 * Wraps `hydrateClashData` (L1) with the Vue Router 5 loader contract.
 */
export const useClashDataLoader = defineBasicLoader(hydrateClashData, { lazy: true });

const { isLoading: isDataLoading } = useClashDataLoader();

const {
  isShowcaseMode,
  visibleItems,
  toggleExpand,
  toggleSelect,
  layoutProps,
  layoutEvents,
  getCardMetadata,
  getMemoKeys,
} = useLeaderboard();

</script>

<template>
  <ConsoleLayout
    title="Roster"
    v-bind="layoutProps"
    v-on="layoutEvents"
  >
    <template #top>
      <!-- Voyage Progress Banner (ACTIVE, PENDING, or AWAITING events) -->
      <VoyageBanner />
    </template>

    <!-- Default Slot: The List -->
    <ConsoleList
      :items="visibleItems"
      :is-showcase-mode="isShowcaseMode"
    >
      <template #item="{ item, index }">
        <MemberCard
          :key="item.id"
          v-memo="getMemoKeys(item.id, [
            item.performanceScore,
            item.dt,
            item.d.rate,
            item.d.wfame,
            item.d.avg,
            item.d.seen
          ])"
          :id="`member-${item.id}`"
          :member="item"
          v-bind="getCardMetadata(item.id)"
          :style="{ '--i': index }"
          @toggle="toggleExpand(item.id)"
          @toggle-select="toggleSelect(item.id)"
        />
      </template>
    </ConsoleList>
  </ConsoleLayout>
</template>
