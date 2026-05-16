<script setup lang="ts" generic="T extends { id: string }">
/**
 * COMPONENT: ConsoleList
 *
 * @remarks
 * A specialized utility component that orchestrates list rendering for the
 * Console-style views (Leaderboard and Headhunter).
 *
 * DESIGN PATTERN:
 * - Hybrid Loop: Supports both "Showcase Mode" (single item + skeletons) and
 *   standard time-sliced rendering.
 * - Scoped Slot: Decouples the iteration logic from the specific card
 *   implementations (MemberCard vs RecruitCard).
 *
 * @param items - The processed subset of items to render (usually from useProgressiveList).
 * @param isShowcaseMode - Flag to trigger the single-item demo layout.
 */
import BaseCardSkeleton from "./BaseCardSkeleton.vue";

defineProps<{
  items: T[];
  isShowcaseMode: boolean;
}>();

defineSlots<{
  /**
   * ITEM SLOT
   * Renders the individual card for each item in the list.
   *
   * @param item - The data object for the current iteration.
   * @param index - The relative index in the visible list (used for staggered animations).
   */
  item(props: { item: T; index: number }): any;
}>();
</script>

<template>
  <template v-if="isShowcaseMode">
    <!-- Showcase Mode: Render only the first item (if any) -->
    <slot
      v-if="items.length > 0"
      name="item"
      :item="items[0]"
      :index="0"
    ></slot>
    <!-- Showcase Mode: Render 7 skeletons -->
    <BaseCardSkeleton v-for="i in 7" :key="'skeleton-' + i" />
  </template>

  <template v-else>
    <!-- Standard Mode: Render all items -->
    <slot
      v-for="(item, index) in items"
      :key="item.id"
      name="item"
      :item="item"
      :index="index"
    ></slot>
  </template>
</template>
