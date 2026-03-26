<script setup lang="ts">
import {
  Icon,
  ConsoleLayout,
  ConsoleList
} from "@shared";
import { useRecruiter } from "../composables/useRecruiter";

import RecruitCard from "../components/RecruitCard.vue";


const {
  sortOptions,
  visibleItems,
  isShowcaseMode,
  refresh,
  toggleExpand,
  toggleSelect,
  layoutProps,
  layoutEvents,
  getCardMetadata,
  isSelectionMode,
} = useRecruiter();

</script>

<template>
  <ConsoleLayout
    title="Headhunter"
    v-bind="layoutProps"
    v-on="layoutEvents"
    :show-search="true"
    :sort-options="sortOptions"
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
          v-memo="[
            item.id,
            item.potentialScore,
            item.t,
            item.d.ago,
            isSelectionMode,
            getCardMetadata(item.id).isExpanded,
            getCardMetadata(item.id).isSelected,
            getCardMetadata(item.id).isRefreshing,
          ]"
          :id="`recruit-${item.id}`"
          :recruit="item"
          :expanded="getCardMetadata(item.id).isExpanded"
          :selected="getCardMetadata(item.id).isSelected"
          :selection-mode="isSelectionMode"
          :style="{ '--i': index }"
          :app-is-refreshing="getCardMetadata(item.id).isRefreshing"
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
