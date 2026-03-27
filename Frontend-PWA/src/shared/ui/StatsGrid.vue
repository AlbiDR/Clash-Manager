// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

<script setup lang="ts">
/**
 * [UI] STATS GRID
 * Shared layout component for displaying player statistics in a grid.
 *
 * @remarks
 * Standardizes the grid layout for expanded card content (MemberCard, RecruitCard).
 * Supports responsive column layouts and accessibility busy states.
 */
const props = defineProps<{
  /** Number of columns in the grid (2 or 3 supported) */
  columns: 2 | 3;
  /** Whether the grid content is currently refreshing */
  loading?: boolean;
}>();
</script>

<template>
  <div
    class="stats-grid"
    :class="`cols-${props.columns}`"
    :aria-busy="props.loading"
  >
    <slot />
  </div>
</template>

<style scoped>
.stats-grid {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
}

.cols-2 {
  grid-template-columns: repeat(2, 1fr);
}

.cols-3 {
  grid-template-columns: repeat(3, 1fr);
}

@media (max-width: 360px) {
  .cols-2 {
    gap: 6px;
  }
}

@media (max-width: 380px) {
  .cols-3 {
    gap: 4px;
  }
}
</style>
