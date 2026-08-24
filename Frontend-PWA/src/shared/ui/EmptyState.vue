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
  <div class="empty-state">
    <div class="empty-icon-box">
      <Icon
        :name="icon || 'telescope'"
        size="48"
      />
    </div>
    <p class="empty-message">
      {{ message }}
    </p>
    <p
      v-if="hint"
      class="empty-hint"
    >
      {{ hint }}
    </p>
    <slot name="action" />
  </div>
</template>

<style scoped>
/* This root previously carried `animate-fade-in`, a class defined nowhere in the stack
   (@core/theme/animations.ts declares `animate-pop` and nothing else), so it styled
   nothing. See the matching note in ErrorState.vue. */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 4rem 2rem;
  text-align: center;
  background: var(--sys-color-surface-container);
  border-radius: var(--sys-shape-corner-l);
  border: 1px dashed var(--sys-color-outline-variant);
}

.empty-icon-box {
  color: var(--sys-color-outline);
  opacity: 0.5;
  margin-bottom: 0.5rem;
}

.empty-message {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--sys-color-on-surface);
  margin: 0;
}

.empty-hint {
  font-size: 0.875rem;
  color: var(--sys-color-on-surface-variant);
  max-width: 240px;
  line-height: 1.5;
}
</style>
