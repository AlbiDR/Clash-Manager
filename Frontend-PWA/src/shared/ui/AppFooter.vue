<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { vTactile } from "../directives/vTactile";
import { useHaptics } from "../composables/useHaptics";

const props = defineProps<{
  version: string;
  badge?: string;
}>();

const haptics = useHaptics();

const handleReload = () => {
  haptics.heavy();
  window.location.reload();
};
</script>

<template>
  <div class="footer-info">
    <div
      class="brand"
      role="button"
      tabindex="0"
      @click="handleReload"
      @keydown.enter="handleReload"
      @keydown.space.prevent="handleReload"
      v-tactile
      v-bind="{ 'aria-label': 'Reload application' }"
    >
      CLASH MANAGER V{{ props.version }}
      <span v-if="props.badge" class="demo-tag">{{ props.badge }}</span>
    </div>
    <div class="copy">Copyright © 2026 AlbiDR</div>
  </div>
</template>

<style scoped>
.footer-info {
  padding: var(--sys-space-40) 0;
  text-align: center;
  user-select: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sys-space-12);
}

.brand {
  font-size: var(--sys-typescale-footer);
  font-weight: 950;
  opacity: 0.8;
  letter-spacing: var(--sys-tracking-widest);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sys-space-8);
  cursor: pointer;
  transition: opacity var(--sys-motion-duration-200);
}

.brand:active {
  opacity: 1;
}

.demo-tag {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  font-size: var(--sys-typescale-label-xs);
  padding: var(--sys-space-2) var(--sys-space-6);
  border-radius: var(--sys-shape-corner-extra-small);
  letter-spacing: var(--sys-tracking-none);
  opacity: 1;
}

.copy {
  font-size: var(--sys-typescale-label-md);
  opacity: 0.7;
}
</style>
