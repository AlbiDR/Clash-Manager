<script setup lang="ts">
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * [UI] BASE BADGE
 * ----------------------------------------------------------------------------
 * Rationale: Low-level atomic component for all badge-like UI elements.
 * Layer: @shared/ui
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * Standardizes the 'badge' class styling and provides a consistent interface
 * for metadata display.
 */
</script>

<template>
  <div class="badge">
    <slot></slot>
  </div>
</template>

<style scoped>
/* Base badge styles are centrally defined in @core/theme/components.ts */
</style>
