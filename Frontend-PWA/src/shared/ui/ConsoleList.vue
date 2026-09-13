<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
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
 * - Positional Continuity: the standard branch is a TransitionGroup, so a row
 *   that changes place under a sort, a search or a dismissal travels there
 *   instead of teleporting. Showcase Mode is deliberately left out: it is a
 *   static demo whose one real row never moves.
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
    />
    <!-- Showcase Mode: Render 7 skeletons -->
    <BaseCardSkeleton
      v-for="i in 7"
      :key="'skeleton-' + i"
    />
  </template>

  <!--
    [DECISION LOG] NO TAG, SO THE DOM IS EXACTLY WHAT IT WAS:
    TransitionGroup renders a fragment when it is given no `tag`, so the rows
    stay direct children of ConsoleLayout's `.list-container` and no wrapper
    element appears between them. The transition is therefore pure behaviour:
    every existing layout, selector and containment rule still addresses the
    same nodes it did before.

    There is no `appear`, so the forty-eight rows do not each fade in on first
    paint. Arrival is already spoken for by the skeleton swap and the `--i`
    stagger; this animates only what changes afterwards - a sort, a search, a
    dismissal. The classes live in core/theme/components.ts, which also records
    why reduced motion needs no branch here.
  -->
  <TransitionGroup
    v-else
    name="console-list"
  >
    <template
      v-for="(item, index) in items"
      :key="item.id"
    >
      <slot
        name="item"
        :item="item"
        :index="index"
      />
    </template>
  </TransitionGroup>
</template>
