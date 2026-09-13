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
 *
 * [DECISION LOG] THE GROUP IS A PROP, NOT A CONSTANT:
 * This component serves two consoles whose cards are not the same size. The
 * capture measures `MemberCard` at 72x54 and `RecruitCard` at 74x62, so a
 * hardcoded group means one of the two consoles is always placing a
 * placeholder built from the other component's measurements.
 *
 * [DECISION LOG] HEIGHT COMES FROM THE SAME CAPTURE AS THE WIDTHS:
 * Height used to come from `.sk-card` in skeletons.ts as a flat 76px, so every
 * row of both lists resized on hydration - by 4px on Roster and 2px on
 * Headhunter, once per row, on every load. The capture that already supplies
 * the widths knows the real answer, and it knows a different one per group.
 */
const props = withDefaults(
  defineProps<{
    index?: number;
    /** Capture group to measure against, e.g. `"MemberCard"` or `"RecruitCard"`. */
    boneGroup?: string;
  }>(),
  { index: undefined, boneGroup: "MemberCard" },
);

// `getBone` returns undefined on a cold checkout, where bones.generated.json
// has not been produced yet; each caller supplies its own fallback rather than
// the registry baking in defaults that would mask a capture regression.
const cardHeight = computed(() => `${getBone(props.boneGroup, "card")?.height ?? 72}px`);
const nameWidth = computed(() => `${getBone(props.boneGroup, "name")?.width ?? 120}px`);
const metaWidth = computed(() => `${getBone(props.boneGroup, "meta")?.width ?? 80}px`);
</script>

<template>
  <div
    class="sk-card skeleton-anim"
    :style="{ height: cardHeight }"
  >
    <div class="sk-header-group">
      <div class="sk-meta-stack">
        <div class="sk-badge-s" />
        <div class="sk-badge-s" />
      </div>

      <div class="sk-info">
        <div
          class="sk-player-name"
          :style="{ width: nameWidth }"
        />
        <div class="sk-trophy-meta">
          <div class="sk-icon-dot" />
          <div
            class="sk-text-line-s"
            :style="{ width: metaWidth }"
          />
        </div>
      </div>
    </div>
    <div class="sk-header-actions">
      <div class="sk-box" />
      <div class="sk-icon-btn-s" />
    </div>
  </div>
</template>

<style scoped>
/* All styles are in style.css for sharing with the static index.html shell */
</style>
