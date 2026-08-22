<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { computed } from "vue";
import { getBone } from "@core/theme/bones";

/**
 * SHARED COMPONENT: BaseCardSkeleton
 *
 * @remarks
 * A unified skeleton placeholder for both Leaderboard and Recruitment cards.
 * Widths are read from `bones.generated.json` (see `capture_skeletons.ts`),
 * a build-time capture of the real `MemberCard`/`RecruitCard` DOM geometry -
 * a single true captured dimension replaces the previous hand-authored,
 * per-index pseudo-variety (itself drift-bait, since it never tracked the
 * real components' actual widths).
 */
defineProps<{
  index?: number;
}>();

const nameWidth = computed(() => `${getBone("MemberCard", "name")?.width ?? 120}px`);
const metaWidth = computed(() => `${getBone("MemberCard", "meta")?.width ?? 80}px`);
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
