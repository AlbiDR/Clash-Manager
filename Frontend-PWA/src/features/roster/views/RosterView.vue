<script setup lang="ts">
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
