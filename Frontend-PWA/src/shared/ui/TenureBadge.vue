// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

<script setup lang="ts">
import BaseBadge from "./BaseBadge.vue";

/**
 * [UI] TENURE BADGE
 * Standardized component for displaying player clan tenure (days in clan).
 */
const { days = 0 } = defineProps<{
  /** Total days in clan */
  days: number | undefined;
}>();
</script>

<template>
  <BaseBadge class="tenure">
    {{ days }}d
  </BaseBadge>
</template>

<style scoped>
.badge.tenure {
  color: var(--sys-color-on-surface);
  background: var(--sys-color-surface-container-highest);
  opacity: 1;
}
</style>
