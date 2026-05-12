// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

<script setup lang="ts">
import { formatRole } from "@core/utils/formatters";
import { computed } from "vue";
import BaseBadge from "./BaseBadge.vue";

/**
 * [UI] ROLE BADGE
 * Standardized component for displaying player clan roles with semantic coloring.
 */
const { role } = defineProps<{
  /** Raw role string from API (e.g., 'coleader', 'elder') */
  role: string;
}>();

const roleInfo = computed(() => formatRole(role));
</script>

<template>
  <BaseBadge class="role" :class="roleInfo.class">
    {{ roleInfo.label }}
  </BaseBadge>
</template>

<style scoped>
.badge.role {
  /* Aligned with global .badge system but maintaining domain-specific scaling */
  width: 100%;
}
</style>
