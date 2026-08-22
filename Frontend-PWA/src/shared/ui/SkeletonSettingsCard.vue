<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { computed } from "vue";
import { getBone } from "@core/theme/bones";

defineProps<{
  index?: number; // Retained for API compatibility with list rendering keys
}>();

// Widths are read from `bones.generated.json`, a build-time capture of the
// real `SettingsCard.vue` DOM geometry (see `capture_skeletons.ts`), rather
// than hand-authored per-index variety values. `SettingsCard`'s body is a
// generic `<slot>` (its content varies per settings section), so there is no
// single real "description line" element to capture - the placeholder rows
// instead scale off the one captured title bone, matching the previous
// hand-authored proportion between title and description widths.
const titleBoneWidth = computed(() => getBone("SettingsCard", "title")?.width ?? 160);
const titleWidth = computed(() => `${titleBoneWidth.value}px`);
const descWidth = computed(() => `${Math.round(titleBoneWidth.value * 1.25)}px`);
const cardMinHeight = computed(() => `${getBone("SettingsCard", "card")?.height ?? 180}px`);
</script>

<template>
  <div class="settings-card skeleton-anim" :style="{ minHeight: cardMinHeight }">
    <div class="card-header">
      <div class="sk-icon-small"></div>
      <!-- Placeholder for header icon -->
      <div class="sk-line-m" :style="{ width: titleWidth }"></div>
      <!-- Placeholder for header title -->
    </div>
    <div class="card-body">
      <div class="features-list">
        <div v-for="i in 3" :key="i" class="toggle-row">
          <div class="row-info">
            <div class="sk-text-line-m" :style="{ width: descWidth }"></div>
            <div
              class="sk-text-line-s"
              :style="{ width: `calc(${descWidth} * 0.7)` }"
            ></div>
          </div>
          <div class="sk-badge-s" style="width: 44px"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-card {
  background: var(--sys-color-surface-container);
  border-radius: 24px;
  border: 1px solid var(--sys-surface-glass-border);
  overflow: hidden;
  margin-bottom: 8px;

  /* CLS Fix: min-height is bound inline from the captured `SettingsCard.card`
     bone (see script block) instead of a hardcoded guess. */

  /* Inherit global skeleton animation */
  animation: pulse 1.5s infinite ease-in-out;
}

.card-header {
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.sk-icon-small {
  width: 20px;
  height: 20px;
  background: var(--sk-fill-secondary);
  border-radius: 4px; /* Square for settings icons */
}

.sk-line-m {
  height: 16px; /* Matches h3 font size */
  background: var(--sk-fill);
  border-radius: 4px;
  flex: 1; /* Allows it to take available space */
}

.card-body {
  padding: 20px;
}

.features-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.row-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}
.sk-badge-s {
  height: 24px;
  background: var(--sk-fill-secondary);
  border-radius: 12px;
}
</style>
