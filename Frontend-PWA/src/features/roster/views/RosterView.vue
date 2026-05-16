<script setup lang="ts">
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

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
 * ============================================================================
 */
import {
  ConsoleLayout,
  ConsoleList
} from "@shared";
import { useLeaderboard } from "../composables/useLeaderboard";
import { MemberCard } from "../components";
import { VoyageBanner } from "../../voyage/components";


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
    <!-- Voyage Progress Banner (ACTIVE events only) -->
    <VoyageBanner />

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
