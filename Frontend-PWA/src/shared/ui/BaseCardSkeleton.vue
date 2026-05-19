<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { computed } from "vue";

/**
 * SHARED COMPONENT: BaseCardSkeleton
 *
 * @remarks
 * A unified skeleton placeholder for both Leaderboard and Recruitment cards.
 * Uses deterministic widths based on index to provide visual variety during loading.
 */
const props = defineProps<{
  index?: number;
}>();

const nameWidth = computed(() => {
  if (props.index === undefined) return "120px";
  const widths = ["120px", "140px", "90px", "130px", "100px", "150px"];
  return widths[props.index % widths.length];
});

const metaWidth = computed(() => {
  if (props.index === undefined) return "80px";
  const widths = ["80px", "90px", "60px", "85px", "70px", "75%"];
  return widths[props.index % widths.length];
});
</script>

<template>
  <div class="sk-card skeleton-anim">
    <div class="sk-header-group">
      <div class="sk-meta-stack">
        <div class="sk-badge-s"></div>
        <div class="sk-badge-s"></div>
      </div>

      <div class="sk-info">
        <div class="sk-player-name" :style="{ width: nameWidth }"></div>
        <div class="sk-trophy-meta">
          <div class="sk-icon-dot"></div>
          <div class="sk-text-line-s" :style="{ width: metaWidth }"></div>
        </div>
      </div>
    </div>
    <div class="sk-header-actions">
      <div class="sk-box"></div>
      <div class="sk-icon-btn-s"></div>
    </div>
  </div>
</template>

<style scoped>
/* All styles are in style.css for sharing with the static index.html shell */
</style>
