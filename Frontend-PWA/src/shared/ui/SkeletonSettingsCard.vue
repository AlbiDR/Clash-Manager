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
  <div
    class="settings-card skeleton-anim"
    :style="{ minHeight: cardMinHeight }"
  >
    <div class="card-header">
      <div class="sk-icon-small" />
      <!-- Placeholder for header icon -->
      <div
        class="sk-line-m"
        :style="{ width: titleWidth }"
      />
      <!-- Placeholder for header title -->
    </div>
  </div>
</template>

<style scoped>
/* [THREAT:] Every value here is a hand-copy of SettingsCard.vue's, so the two
   drift apart silently whenever the real card is restyled - and they had. The
   radius still read 24px against the real card's 8px, the header still padded
   16px/20px against 12px/16px, and this card carried an 8px bottom margin the
   real one does not, on top of the 10px gap the settings column already
   supplies. Hydrating the Settings screen reshaped and re-spaced every card in
   the list. Keep these in lockstep with SettingsCard.vue. */
.settings-card {
  background: var(--sys-color-surface-container);
  border-radius: var(--sys-shape-corner-small);
  border: 1px solid var(--sys-surface-glass-border);
  overflow: hidden;
  margin: 0;

  /* CLS Fix: min-height is bound inline from the captured `SettingsCard.card`
     bone (see script block) instead of a hardcoded guess. */

  /* Inherit global skeleton animation */
  animation: pulse 1.5s infinite ease-in-out;
}

.card-header {
  min-height: var(--sys-space-56);
  padding: var(--sys-space-12) var(--sys-space-16);
  display: flex;
  align-items: center;
  gap: var(--sys-space-12);
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
