<script setup lang="ts">
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import BaseBadge from "./BaseBadge.vue";

/**
 * [UI] TAG BADGE
 * ----------------------------------------------------------------------------
 * Rationale: Standardized component for displaying player tags with consistent
 * truncation and formatting.
 * Layer: @shared/ui
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * Encapsulates the logic for identifying players via their truncated tags,
 * improving visual consistency across different card types.
 */
const props = defineProps<{
  /** Unique player tag identifier (e.g., 'ABC1234'). */
  id: string;
}>();
</script>

<template>
  <BaseBadge class="tag" :aria-label="`Player tag: #${props.id}`">
    #{{ props.id.substring(0, 5) }}
  </BaseBadge>
</template>

<style scoped>
/* Inherits base styles from .badge in @core/theme/components.ts */
</style>
