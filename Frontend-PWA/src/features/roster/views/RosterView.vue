<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->

<!-- [VR5] Plain script block: module-level export required by DataLoaderPlugin.
     Vue SFC compiler forbids `export` inside <script setup>; the non-setup
     block is the canonical location for named exports on SFC components. -->
<script lang="ts">
import { defineBasicLoader } from "vue-router/experimental";
import { hydrateClashData } from "@core";

/**
 * Route data loader - exported so the DataLoaderPlugin can discover it.
 * Wraps `hydrateClashData` (L1) with the Vue Router 5 loader contract.
 * lazy: true preserves Stale-While-Revalidate; view renders from cache
 * immediately while the Supabase refresh fires in the background.
 */
export const useClashDataLoader = defineBasicLoader(hydrateClashData, { lazy: true });
</script>

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
 * - `useClashDataLoader` exported from the plain script block above for
 *   DataLoaderPlugin discovery. Called here for reactive isLoading state.
 * - `lazy: true` preserves Stale-While-Revalidate: the view renders immediately
 *   from the IndexedDB cache while the Supabase refresh runs in the background.
 * ============================================================================
 */
import {
  ConsoleLayout,
  ConsoleList
} from "@shared";
import { useLeaderboard } from "../composables/useLeaderboard";
import { MemberCard } from "../components";
import { VoyageBanner } from "@shared";

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
      <template #item="{ item: memberSnapshot, index }">
        <MemberCard
          :key="memberSnapshot.id"
          v-memo="getMemoKeys(memberSnapshot.id, [
            memberSnapshot.performanceScore,
            memberSnapshot.dt,
            memberSnapshot.d.rate,
            memberSnapshot.d.wfame,
            memberSnapshot.d.avg,
            memberSnapshot.d.seen
          ])"
          :id="`member-${memberSnapshot.id}`"
          :member="memberSnapshot"
          v-bind="getCardMetadata(memberSnapshot.id)"
          :style="{ '--i': index }"
          @toggle="toggleExpand(memberSnapshot.id)"
          @toggle-select="toggleSelect(memberSnapshot.id)"
        />
      </template>
    </ConsoleList>
  </ConsoleLayout>
</template>
