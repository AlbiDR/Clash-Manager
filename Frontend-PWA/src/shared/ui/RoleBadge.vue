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
  font-family: var(--sys-font-family-body);
  font-weight: 900;
  font-size: 9px;
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  width: fit-content;
}

/* Semantic Coloring */
.role-leader {
  background: rgba(var(--sys-color-primary-rgb), 0.15);
  color: var(--sys-color-primary);
}

.role-coleader {
  background: rgba(var(--sys-color-secondary-rgb), 0.15);
  color: var(--sys-color-secondary);
}

.role-elder {
  background: rgba(var(--sys-color-tertiary-rgb), 0.15);
  color: var(--sys-color-tertiary);
}

.role-member {
  background: rgba(var(--sys-color-outline-rgb), 0.1);
  color: var(--sys-color-outline);
}
</style>
