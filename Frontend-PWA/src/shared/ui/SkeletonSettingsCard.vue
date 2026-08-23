<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { computed } from "vue";
import { getBone } from "@core/theme/bones";

defineProps<{
  index?: number; // Retained for API compatibility with list rendering keys
}>();

/**
 * @remarks
 * [DECISION LOG] Matches the real `SettingsCard.vue` in its default COLLAPSED
 * state - a header only, no body - because that is what a real user actually
 * sees for the entire duration this skeleton is visible (`initiallyExpanded`
 * is driven by Showcase mode, which is off for a normal user; hydration
 * loading is unrelated to that). A previous version unconditionally rendered
 * 3 fake toggle rows regardless of collapse state, so even a correctly
 * captured header height was overridden by that hardcoded body content,
 * rendering roughly 3.5x taller than any real collapsed card. Dimensions
 * come from `bones.generated.json`, a build-time capture of the real
 * component (see `capture_skeletons.ts`), not hand-authored guesses.
 */
const titleWidth = computed(() => `${getBone("SettingsCard", "title")?.width ?? 160}px`);
const cardMinHeight = computed(() => `${getBone("SettingsCard", "card")?.height ?? 68}px`);
</script>

<template>
  <div class="settings-card skeleton-anim" :style="{ minHeight: cardMinHeight }">
    <div class="card-header">
      <div class="sk-icon-small"></div>
      <!-- Placeholder for header icon -->
      <div class="sk-line-m" :style="{ width: titleWidth }"></div>
      <!-- Placeholder for header title -->
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
</style>
