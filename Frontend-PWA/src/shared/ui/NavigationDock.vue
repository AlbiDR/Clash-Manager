<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { useRoute, useRouter } from "vue-router";
import Icon from "./Icon.vue";
import { useHaptics, NAV_ITEMS } from "@core";

/**
 * COMPONENT: NavigationDock
 *
 * @remarks
 * Renders the primary application navigation rail at the bottom of the viewport.
 * Orchestrates route transitions and provides tactile feedback.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 2 Shared UI (@shared/ui)
 * - **Role:** Global Navigation Orchestration.
 * - **Satisfaction:** ADR Section II: Structural Unitary Architecture.
 *
 * @sideeffects
 * - Triggers haptic feedback via `useHaptics`.
 * - Mutates browser history via `vue-router`.
 */

const route = useRoute();
const router = useRouter();
const haptics = useHaptics();

/**
 * [DECISION LOG] IDEMPOTENT NAVIGATION: Guards against redundant router
 * pushes if the user is already on the target route.
 *
 * [THREAT:] Redundant history entries if navigation guard is bypassed.
 */
function goTo(targetPath: string) {
  if (route.path === targetPath) return;
  router.push(targetPath);
}

/**
 * [DECISION LOG] HAPTIC FEEDBACK: We trigger haptics on `pointerdown` rather
 * than `click` to provide immediate tactile acknowledgment of the intent,
 * improving perceived responsiveness.
 */
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
  height: var(--sys-space-56);
  flex: 1;
  min-width: 64px;
  padding: 0 var(--sys-space-12);
  border-radius: var(--sys-shape-corner-full);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sys-space-10);
  font-size: var(--sys-typescale-body-rg);
  font-weight: 850;
  color: var(--sys-color-on-surface);
  cursor: pointer;
  transition: all var(--sys-motion-duration-200) var(--sys-motion-easing-decelerate);
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
  animation: pop-in var(--sys-motion-duration-300) var(--sys-motion-easing-spring-nav);
  box-shadow: 0 6px 16px rgba(var(--sys-color-primary-rgb), 0.4);
}

.dock-label {
  transition: opacity var(--sys-motion-duration-300);
  letter-spacing: var(--sys-tracking-neg-1);
}

@media (max-width: 600px) {
  .dock-item {
    flex: 1;
    min-width: 0;
    padding: 0;
    gap: var(--sys-space-4);
    font-size: var(--sys-typescale-body-sm);
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
