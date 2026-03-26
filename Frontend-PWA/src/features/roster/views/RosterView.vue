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

import MemberCard from "../components/MemberCard.vue";


const {
  data,
  isShowcaseMode,
  visibleItems,
  isSelectionMode,
  sortOptions,
  toggleExpand,
  toggleSelect,
  layoutProps,
  layoutEvents,
  getCardMetadata,
} = useLeaderboard();

</script>

<template>
  <ConsoleLayout
    title="Roster"
    v-bind="layoutProps"
    v-on="layoutEvents"
    :show-search="true"
    :sort-options="sortOptions"
  >
    <!-- Default Slot: The List -->
    <ConsoleList
      :items="visibleItems"
      :is-showcase-mode="isShowcaseMode"
    >
      <template #item="{ item, index }">
        <MemberCard
          :key="item.id"
          v-memo="[
            item.id,
            item.performanceScore,
            item.dt,
            isSelectionMode,
            // [PERF] STABLE STATUS FLAGS: Accessing primitive properties from the
            // metadata helper ensures v-memo performs a correct shallow comparison,
            // bypassing the new object reference returned on every render.
            getCardMetadata(item.id).isExpanded,
            getCardMetadata(item.id).isSelected,
            getCardMetadata(item.id).isRefreshing,
            data?.playerTag === item.id,
          ]"
          :id="`member-${item.id}`"
          :member="item"
          :expanded="getCardMetadata(item.id).isExpanded"
          :selected="getCardMetadata(item.id).isSelected"
          :selection-mode="isSelectionMode"
          :is-tagged="data?.playerTag === item.id"
          :style="{ '--i': index }"
          :app-is-refreshing="getCardMetadata(item.id).isRefreshing"
          @toggle="toggleExpand(item.id)"
          @toggle-select="toggleSelect(item.id)"
        />
      </template>
    </ConsoleList>
  </ConsoleLayout>
</template>
