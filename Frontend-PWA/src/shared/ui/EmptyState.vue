<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import Icon from "./Icon.vue";
defineProps<{
  icon?: string;
  message: string;
  hint?: string;
}>();
</script>

<template>
  <section
    class="empty-state"
    role="status"
  >
    <div class="empty-icon-box">
      <Icon
        :name="icon || 'telescope'"
        size="48"
      />
    </div>
    <h2 class="empty-message">
      {{ message }}
    </h2>
    <p
      v-if="hint"
      class="empty-hint"
    >
      {{ hint }}
    </p>
    <slot name="action" />
  </section>
</template>

<style scoped>
/* This root previously carried `animate-fade-in`, a class defined nowhere in the stack
   (@core/theme/animations.ts declares `animate-pop` and nothing else), so it styled
   nothing. See the matching note in ErrorState.vue. */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sys-space-16);
  padding: var(--sys-space-48) var(--sys-space-24);
  text-align: center;
  background: var(--sys-color-surface-container);
  border-radius: var(--sys-shape-corner-l);
  border: 1px dashed var(--sys-color-outline-variant);
}

.empty-icon-box {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sys-color-outline);
  opacity: 0.5;
  margin-bottom: var(--sys-space-4);
}

.empty-message {
  margin: 0;
  font-size: var(--sys-typescale-title-sm);
  font-weight: 800;
  line-height: var(--sys-leading-tight);
  color: var(--sys-color-on-surface);
}

.empty-hint {
  margin: 0;
  font-size: var(--sys-typescale-body-sm);
  color: var(--sys-color-on-surface-variant);
  max-width: 32ch;
  line-height: var(--sys-leading-normal);
}

@media (max-width: 360px) {
  .empty-state {
    padding: var(--sys-space-40) var(--sys-space-16);
  }
}
</style>
