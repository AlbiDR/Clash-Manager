// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

<script setup lang="ts">
/**
 * [UI] TENURE BADGE
 * Standardized component for displaying player clan tenure (days in clan).
 */
const props = defineProps<{
  /** Total days in clan */
  days: number | undefined;
}>();
</script>

<template>
  <div class="badge tenure">
    {{ props.days || 0 }}d
  </div>
</template>

<style scoped>
.badge.tenure {
  font-family: var(--sys-font-family-body);
  font-weight: 700;
  font-size: 10px;
  color: var(--sys-color-outline);
  background: rgba(var(--sys-color-outline-rgb), 0.08);
  padding: 2px 6px;
  border-radius: 6px;
  width: fit-content;
  white-space: nowrap;
}
</style>
