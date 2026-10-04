<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { useRoute, useRouter } from "vue-router";
import { computed, onMounted, ref, watch } from "vue";
import Icon from "./Icon.vue";
import { NAV_ITEMS } from "@core";
import { useHaptics } from "../composables/useHaptics";

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
const pendingPath = ref<string | null>(null);
const displayPath = computed(() => pendingPath.value ?? route.path);
const areIconsMounted = ref(false);
let navigationTicket = 0;

// The static substrate renders these geometry-preserving placeholders too.
// Keeping them for Vue's initial patch makes the two DOM trees identical;
// only after mount may the shared Icon primitive introduce SVG markup.
onMounted(() => {
  areIconsMounted.value = true;
});

watch(
  () => route.path,
  (routePath) => {
    if (pendingPath.value && routePath !== pendingPath.value) return;
    pendingPath.value = null;
  },
);

/** The first tab: where Back lands from every other tab. */
const START_PATH = NAV_ITEMS[0].path;

/**
 * [DECISION LOG] BACK RETURNS TO THE FIRST TAB, THEN LEAVES:
 * Every tab switch pushed a history entry, so Back walked through every tab
 * visited before the Android app finally closed. Bottom navigation on Android
 * goes back to the start tab and then exits, so history now only ever holds
 * the start tab and the tab in front of it: leaving the start tab pushes, a
 * switch between two other tabs replaces, and returning to the start tab
 * steps back onto the entry already there instead of stacking a second one.
 *
 * @param targetPath - The tab being opened.
 */
function navigateToTab(targetPath: string): Promise<unknown> {
  if (route.path === START_PATH) return router.push(targetPath);
  if (targetPath === START_PATH && router.options.history.state.back === START_PATH) {
    // router.back() returns nothing; settle when the popped navigation lands.
    return new Promise<void>((resolve) => {
      const stopListening = router.afterEach(() => {
        stopListening();
        resolve();
      });
      router.back();
    });
  }
  return router.replace(targetPath);
}

/**
 * [DECISION LOG] IDEMPOTENT NAVIGATION: Guards against redundant router
 * pushes if the user is already on the target route.
 *
 * [THREAT:] Redundant history entries if navigation guard is bypassed.
 */
async function goTo(targetPath: string) {
  if (displayPath.value === targetPath) return;

  const currentTicket = ++navigationTicket;
  pendingPath.value = targetPath;
  try {
    await navigateToTab(targetPath);
  } catch (navigationError) {
    console.warn("[NavigationDock] Navigation failed", navigationError);
  } finally {
    if (currentTicket === navigationTicket) pendingPath.value = null;
  }
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
    v-for="navItemCandidate in NAV_ITEMS"
    :key="navItemCandidate.name"
    type="button"
    class="dock-item"
    :class="{
      active: displayPath === navItemCandidate.path,
      pending: pendingPath === navItemCandidate.path
    }"
    :aria-label="navItemCandidate.label"
    :aria-busy="pendingPath === navItemCandidate.path ? 'true' : undefined"
    v-bind="{ 'aria-current': route.path === navItemCandidate.path ? 'page' : undefined }"
    @click.stop.prevent="goTo(navItemCandidate.path)"
    @pointerdown="onInteractionStart"
  >
    <div
      v-if="displayPath === navItemCandidate.path"
      class="capsule-bg"
    />

    <!-- Pending navigation keeps the destination optimistically selected, but
         color alone cannot explain why it has not opened yet. This local ring
         is deliberately out of flow so labels and icons never shift while the
         router's data loader settles. -->
    <span
      v-if="pendingPath === navItemCandidate.path"
      class="pending-indicator"
      aria-hidden="true"
    />

    <Icon
      v-if="areIconsMounted"
      :name="navItemCandidate.icon"
      size="var(--sys-layout-dock-icon-size)"
      class="dock-icon"
    />
    <span
      v-else
      class="dock-icon dock-icon-placeholder"
      aria-hidden="true"
    />

    <span
      v-if="navItemCandidate.label"
      class="dock-label"
    >
      {{ navItemCandidate.label }}
    </span>
  </button>
</template>

<style scoped>
.dock-icon-placeholder {
  display: block;
  width: var(--sys-layout-dock-icon-size);
  height: var(--sys-layout-dock-icon-size);
  flex: 0 0 var(--sys-layout-dock-icon-size);
  border-radius: var(--sys-shape-corner-small);
  background: currentColor;
  opacity: var(--sys-opacity-dock-placeholder);
}

.dock-item {
  position: relative;
  height: var(--sys-space-56);
  flex: 1;
  min-width: var(--sys-layout-dock-item-min-width);
  padding: 0 var(--sys-space-12);
  border-radius: var(--sys-shape-corner-full);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sys-space-10);
  font-size: var(--sys-typescale-body-rg);
  font-weight: var(--sys-font-weight-dock);
  color: var(--sys-color-on-surface);
  cursor: pointer;
  transition:
    transform var(--sys-motion-duration-100) var(--sys-motion-easing-decelerate),
    background var(--sys-motion-duration-200) var(--sys-motion-easing-decelerate),
    color var(--sys-motion-duration-200) var(--sys-motion-easing-decelerate),
    opacity var(--sys-motion-duration-200) var(--sys-motion-easing-decelerate);
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  user-select: none;
  background: none;
  border: none;
  font-family: inherit;
  white-space: nowrap;
  transform: translateZ(0);
}

.dock-item:active {
  transform: scale(0.92);
  background: rgba(var(--sys-color-primary-rgb), 0.1);
}

/* The active capsule alone is not a reliable focus marker: a keyboard reader
   can move from the active tab to an inactive one with no visual change. */
.dock-item:focus-visible {
  outline: var(--sys-space-2) solid var(--sys-color-primary);
  outline-offset: var(--sys-space-2);
}

.dock-item.active {
  color: var(--sys-color-on-primary);
  flex: var(--sys-layout-dock-active-grow);
}

.dock-item.pending {
  opacity: 1;
}

/* `displayPath` points at the pending destination, so that button is both
   active and pending. Preserve the active capsule's contrast instead of
   painting primary ink on the same primary ground. */
.dock-item.active.pending {
  color: var(--sys-color-on-primary);
}

.pending-indicator {
  position: absolute;
  top: var(--sys-space-6);
  right: var(--sys-space-8);
  width: var(--sys-space-10);
  height: var(--sys-space-10);
  border: var(--sys-space-2) solid currentColor;
  border-top-color: transparent;
  border-radius: var(--sys-shape-corner-full);
  animation: spin var(--sys-motion-ambient-spin) linear infinite;
  pointer-events: none;
}

.dock-item.active:active {
  transform: scale(0.96);
  background: none;
}

.capsule-bg {
  position: absolute;
  inset: 0;
  /* [DECISION LOG] A FLAT FILL, STATED AS ONE:
     This was a two-stop gradient whose second stop was `--sys-color-primary-variant`,
     a Material 2 role this Material 3 token set never defined, so the declaration
     always fell through to its `--sys-color-primary` fallback and painted flat.
     Written here as the flat fill it has always rendered as, so the code and the
     pixels agree. Reintroducing a ramp is a design decision, not a repair. */
  background: var(--sys-color-primary);
  border-radius: var(--sys-shape-corner-full);
  z-index: -1;
  box-shadow: var(--sys-elevation-dock-active);
}

.dock-item.pending .capsule-bg {
  animation: pop-in var(--sys-motion-duration-300) var(--sys-motion-easing-spring-nav);
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
    flex: var(--sys-layout-dock-compact-active-grow);
  }
  .dock-item.active .dock-label {
    display: block;
    max-width: var(--sys-layout-dock-label-max-width);
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

/* A phone in landscape is short on height, not width. Keep the rail clear of
   primary content by using icon-only 48px targets at the trailing edge. The
   button aria-labels preserve the same accessible navigation names. */
@media (orientation: landscape) and (max-height: 520px) {
  .dock-item {
    flex: 0 0 var(--sys-space-48);
    min-width: var(--sys-space-48);
    width: var(--sys-space-48);
    height: var(--sys-space-48);
    padding: 0;
  }

  .dock-item.active {
    flex: 0 0 var(--sys-space-48);
  }

  .dock-label {
    display: none;
  }
}
</style>
