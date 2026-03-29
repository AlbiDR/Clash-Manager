// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

<script setup lang="ts">
import { formatRole } from "@core/utils/formatters";
import { computed } from "vue";

/**
 * [UI] ROLE BADGE
 * Standardized component for displaying player clan roles with semantic coloring.
 */
const props = defineProps<{
  /** Raw role string from API (e.g., 'coleader', 'elder') */
  role: string;
}>();

const roleInfo = computed(() => formatRole(props.role));
</script>

<template>
  <div class="badge role" :class="roleInfo.class">
    {{ roleInfo.label }}
  </div>
</template>

<style scoped>
.badge.role {
  /* Aligned with global .badge system but maintaining domain-specific scaling */
  width: 100%;
}
</style>
