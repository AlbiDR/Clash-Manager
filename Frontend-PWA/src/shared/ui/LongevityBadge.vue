<script setup lang="ts">
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import BaseBadge from "./BaseBadge.vue";

/**
 * [UI] LONGEVITY BADGE
 * ----------------------------------------------------------------------------
 * Rationale: Standardized component for displaying discovery or activity duration.
 * Layer: @shared/ui
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * Encapsulates the specific layout requirements for time-based badges to ensure
 * they remain visible and properly aligned within card headers.
 */
defineProps<{
  /** Formatted time string (e.g., '2h 15m' or '3d'). */
  time: string;
}>();
</script>

<template>
  <BaseBadge class="time longevity-badge">
    {{ time }}
  </BaseBadge>
</template>

<style scoped>
.longevity-badge {
  display: flex !important;
  visibility: visible !important;
  opacity: 1 !important;
  min-height: 18px;
  flex-shrink: 0;
}
</style>
