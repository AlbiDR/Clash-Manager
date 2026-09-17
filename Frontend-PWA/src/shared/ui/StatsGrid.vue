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
  /** Optional heading that gives a group of metrics a readable purpose. */
  label?: string;
  /** Brief supporting context, kept visually quieter than the section label. */
  detail?: string;
}>();
</script>

<template>
  <section
    class="stats-section"
    :aria-label="props.label"
  >
    <header
      v-if="props.label"
      class="stats-section-heading"
    >
      <span>{{ props.label }}</span>
      <span
        v-if="props.detail"
        class="stats-section-detail"
      >{{ props.detail }}</span>
    </header>
    <div
      class="stats-grid"
      :class="`cols-${props.columns}`"
      :aria-busy="props.loading"
    >
      <slot />
    </div>
  </section>
</template>

<style scoped>
.stats-section {
  display: grid;
  gap: var(--sys-space-8);
}

.stats-section-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sys-space-12);
  min-width: 0;
  color: var(--sys-color-on-surface-variant);
  font-family: var(--sys-font-family-mono);
  font-size: var(--sys-typescale-label-sm);
  font-weight: 800;
  letter-spacing: var(--sys-tracking-wide);
  line-height: var(--sys-leading-none);
  text-transform: uppercase;
}

.stats-section-detail {
  overflow: hidden;
  color: var(--sys-color-primary);
  font-weight: 700;
  letter-spacing: normal;
  text-align: end;
  text-overflow: ellipsis;
  text-transform: none;
  white-space: nowrap;
}

.stats-grid {
  display: grid;
  gap: var(--sys-space-8);
}

.cols-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.cols-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

@media (max-width: 360px) {
  .cols-2 {
    gap: var(--sys-space-6);
  }
}

@media (max-width: 380px) {
  .cols-3 {
    gap: var(--sys-space-4);
  }
}
</style>
