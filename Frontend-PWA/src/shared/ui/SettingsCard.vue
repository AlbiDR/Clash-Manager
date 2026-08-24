<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { Icon, vTactile, useHaptics } from "@shared";
import { ref } from "vue";
const props = defineProps<{
  title: string;
  icon: string;
  loading?: boolean;
  bodyClass?: string;
  initiallyExpanded?: boolean;
}>();

const haptics = useHaptics();
const isCollapsed = ref(!props.initiallyExpanded);

const toggleCollapse = () => {
  haptics.tap();
  isCollapsed.value = !isCollapsed.value;
};
</script>

<template>
  <div
    class="settings-card"
    data-bone="SettingsCard.card"
    :class="{ collapsed: isCollapsed }"
    :aria-busy="loading ? 'true' : 'false'"
  >
    <div class="card-header" @click="toggleCollapse" v-tactile>
      <div class="header-main">
        <Icon :name="icon" size="20" class="header-icon" />
        <h3 data-bone="SettingsCard.title">{{ title }}</h3>
      </div>
      <div class="header-actions">
        <slot name="header-extra" />
        <button
          class="expand-btn"
          :class="{ rotated: !isCollapsed }"
          :aria-expanded="!isCollapsed"
          :aria-label="isCollapsed ? `Expand ${title} section` : `Collapse ${title} section`"
        >
          <Icon name="chevron_down" size="18" />
        </button>
      </div>
    </div>
    <Transition name="collapse">
      <div v-if="!isCollapsed" class="card-body" :class="bodyClass">
        <slot />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.settings-card {
  background: var(--sys-color-surface-container);
  border-radius: 8px;
  border: 1px solid var(--sys-surface-glass-border);
  overflow: hidden;
  margin: 0;
  transition:
    background-color var(--sys-motion-duration-200) var(--sys-motion-easing-standard),
    border-color var(--sys-motion-duration-200) var(--sys-motion-easing-standard),
    box-shadow var(--sys-motion-duration-250) var(--sys-motion-easing-standard);
}

.settings-card:not(.collapsed) {
  background: var(--sys-color-surface-container-high);
  box-shadow: var(--sys-elevation-1);
  border-color: rgba(var(--sys-color-primary-rgb), 0.18);
}

.card-header {
  min-height: 56px;
  padding: var(--sys-space-12) var(--sys-space-16);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sys-space-12);
  cursor: pointer;
  user-select: none;
}

.settings-card:not(.collapsed) .card-header {
  border-bottom: 1px solid rgba(var(--sys-color-outline-rgb), 0.1);
}

.header-main {
  display: flex;
  align-items: center;
  gap: var(--sys-space-12);
}

.card-header h3 {
  margin: 0;
  font-size: var(--sys-typescale-body-md);
  font-weight: 850;
  color: var(--sys-color-on-surface);
}

.header-icon {
  color: var(--sys-color-primary);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--sys-space-12);
}

.expand-btn {
  background: none;
  border: none;
  color: var(--sys-color-outline);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--sys-space-4);
  cursor: pointer;
  transition: transform var(--sys-motion-duration-300) var(--sys-motion-easing-standard);
  opacity: 0.5;
}

.expand-btn.rotated {
  transform: rotate(180deg);
  opacity: 1;
  color: var(--sys-color-primary);
}

.card-body {
  padding: var(--sys-space-16);
}

/* Collapse Transition */
.collapse-enter-active,
.collapse-leave-active {
  transition: all var(--sys-motion-duration-300) var(--sys-motion-easing-standard);
  max-height: 1000px;
  opacity: 1;
}

.collapse-enter-from,
.collapse-leave-to {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
  overflow: hidden;
}
</style>
