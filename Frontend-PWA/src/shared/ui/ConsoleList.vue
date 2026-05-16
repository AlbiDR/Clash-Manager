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
  <slot
    v-for="(item, index) in items"
    :key="item.id"
    name="item"
    :item="item"
    :index="index"
  ></slot>
</template>
