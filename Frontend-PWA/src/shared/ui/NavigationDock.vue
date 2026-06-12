<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { useRoute, useRouter } from "vue-router";
import Icon from "./Icon.vue";
import { useHaptics, NAV_ITEMS } from "@core";

/**
 * [UI] NAVIGATION DOCK
 * ----------------------------------------------------------------------------
 * Rationale: Renders the primary application navigation items.
 * Layer: @shared/ui
 * ----------------------------------------------------------------------------
 */

const route = useRoute();
const router = useRouter();
const haptics = useHaptics();

function goTo(targetPath: string) {
  if (route.path === targetPath) return;
  router.push(targetPath);
}

function onInteractionStart() {
  haptics.tap();
}
</script>

<template>
  <button
    v-for="item in NAV_ITEMS"
    :key="item.name"
    class="dock-item"
    :class="{ active: route.path === item.path }"
    @click="goTo(item.path)"
    @pointerdown="onInteractionStart"
    :aria-label="item.label"
    v-bind="{ 'aria-current': route.path === item.path ? 'page' : undefined }"
  >
    <div v-if="route.path === item.path" class="capsule-bg"></div>
    <Icon :name="item.icon" size="22" class="dock-icon" />
    <span v-if="item.label" class="dock-label">
      {{ item.label }}
    </span>
  </button>
</template>

<style scoped>
.dock-item {
  position: relative;
  height: 56px;
  flex: 1;
  min-width: 64px;
  padding: 0 12px;
  border-radius: var(--sys-shape-corner-full);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 850;
  color: var(--sys-color-on-surface);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
  -webkit-tap-highlight-color: transparent;
  background: none;
  border: none;
  font-family: inherit;
  white-space: nowrap;
}

.dock-item:active {
  transform: scale(0.92);
  background: rgba(var(--sys-color-primary-rgb), 0.1);
}

.dock-item.active {
  color: var(--sys-color-on-primary);
  flex: 1.2;
}

.dock-item.active:active {
  transform: scale(0.96);
  background: none;
}

.capsule-bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    135deg,
    var(--sys-color-primary),
    var(--sys-color-primary-variant, var(--sys-color-primary))
  );
  border-radius: var(--sys-shape-corner-full);
  z-index: -1;
  animation: pop-in 0.3s cubic-bezier(0.2, 0, 0, 1.2);
  box-shadow: 0 6px 16px rgba(var(--sys-color-primary-rgb), 0.4);
}

.dock-label {
  transition: opacity 0.3s;
  letter-spacing: -0.01em;
}

@media (max-width: 600px) {
  .dock-item {
    flex: 1;
    min-width: 0;
    padding: 0;
    gap: 4px;
    font-size: 13px;
  }
  .dock-item .dock-label {
    display: none;
  }
  .dock-item.active {
    flex: 2;
  }
  .dock-item.active .dock-label {
    display: block;
    max-width: 80px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>
