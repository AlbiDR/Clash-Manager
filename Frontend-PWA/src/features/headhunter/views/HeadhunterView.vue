<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
/**
 * ============================================================================
 * [FEATURE] HEADHUNTER VIEW
 * ----------------------------------------------------------------------------
 * **Data Loading Strategy (Vue Router 5):**
 * - `useClashDataLoader` exported as a named export for DataLoaderPlugin discovery.
 * - `lazy: true` preserves Stale-While-Revalidate PWA topology.
 * ============================================================================
 */
import { defineBasicLoader } from "vue-router/experimental";
import {
  Icon,
  ConsoleLayout,
  ConsoleList
} from "@shared";
import { hydrateClashData } from "@core";
import { useRecruiter } from "../composables/useRecruiter";
import { RecruitCard } from "../components";

/**
 * Route data loader - exported so the DataLoaderPlugin can discover it.
 * Wraps `hydrateClashData` (L1) with the Vue Router 5 loader contract.
 */
export const useClashDataLoader = defineBasicLoader(hydrateClashData, { lazy: true });

const { isLoading: isDataLoading } = useClashDataLoader();

const {
  visibleItems,
  isShowcaseMode,
  refresh,
  toggleExpand,
  toggleSelect,
  layoutProps,
  layoutEvents,
  getCardMetadata,
  getMemoKeys,
} = useRecruiter();

</script>

<template>
  <ConsoleLayout
    title="Headhunter"
    v-bind="layoutProps"
    v-on="layoutEvents"
  >
    <!-- Custom Empty Action for Recruit View -->
    <template #empty-action>
      <button class="btn-primary" @click="refresh">
        <Icon name="refresh" size="18" />
        <span>Scan Again</span>
      </button>
    </template>
    <!-- Default Slot: The List -->
    <ConsoleList
      :items="visibleItems"
      :is-showcase-mode="isShowcaseMode"
    >
      <template #item="{ item, index }">
        <RecruitCard
          :key="item.id"
          v-memo="getMemoKeys(item.id, [
            item.potentialScore,
            item.t,
            item.longevityLabel,
            item.d.don,
            item.d.cards,
            item.d.war
          ])"
          :id="`recruit-${item.id}`"
          :recruit="item"
          v-bind="getCardMetadata(item.id)"
          :style="{ '--i': index }"
          @toggle="toggleExpand(item.id)"
          @toggle-select="toggleSelect(item.id)"
        />
      </template>
    </ConsoleList>
  </ConsoleLayout>
</template>

<style scoped>
.btn-primary {
  margin-top: 16px;
}
</style>
