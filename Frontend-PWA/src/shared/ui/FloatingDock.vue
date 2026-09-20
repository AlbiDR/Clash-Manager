<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
/**
 * [SHARED] FLOATING DOCK
 * ----------------------------------------------------------------------------
 * Rationale: Orchestrates the global navigation dock and selection FAB.
 * Layer: @shared/ui
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * Acts as a lightweight orchestrator that toggles between `NavigationDock`
 * and `SelectionFab` based on the global UI state. Centralizes viewport-aware
 * styling for the dock container.
 */
import { ref } from "vue";
import { useUiCoordinator } from "@core";
import { useViewport } from "../composables/useViewport";
import NavigationDock from "./NavigationDock.vue";
import SelectionFab from "./SelectionFab.vue";

const { dockVisible } = useUiCoordinator();
const { isDesktop } = useViewport();

interface DockSize {
  width: number;
  height: number;
}

const dockContainer = ref<HTMLElement | null>(null);
const isSwapping = ref(false);
// Keep the outgoing layout active until it has been measured. Tying this
// directly to `dockVisible` would apply the mobile `width: auto` rule before
// Vue invokes the leave hook, losing the navigation rail's starting size.
const isSelectionLayout = ref(!dockVisible.value);
let previousSize: DockSize | null = null;
let resizeFrame: number | null = null;

function measureDock(element: HTMLElement): DockSize {
  const { width, height } = element.getBoundingClientRect();
  return { width, height };
}

/**
 * `getBoundingClientRect()` measures the border box, while `width` and
 * `height` normally address the content box. Account for that distinction so
 * the temporary lock reproduces the dock's exact on-screen dimensions.
 */
function lockDockSize(element: HTMLElement, size: DockSize) {
  const styles = window.getComputedStyle(element);
  const horizontalChrome = styles.boxSizing === "border-box"
    ? 0
    : Number.parseFloat(styles.paddingLeft)
      + Number.parseFloat(styles.paddingRight)
      + Number.parseFloat(styles.borderLeftWidth)
      + Number.parseFloat(styles.borderRightWidth);
  const verticalChrome = styles.boxSizing === "border-box"
    ? 0
    : Number.parseFloat(styles.paddingTop)
      + Number.parseFloat(styles.paddingBottom)
      + Number.parseFloat(styles.borderTopWidth)
      + Number.parseFloat(styles.borderBottomWidth);

  element.style.width = `${Math.max(0, size.width - horizontalChrome)}px`;
  element.style.height = `${Math.max(0, size.height - verticalChrome)}px`;
}

function clearDockSizeLock() {
  const element = dockContainer.value;
  if (!element) return;

  element.style.removeProperty("width");
  element.style.removeProperty("height");
}

function stopResizeFrame() {
  if (resizeFrame === null) return;
  window.cancelAnimationFrame(resizeFrame);
  resizeFrame = null;
}

function setSelectionLayout(isSelection: boolean) {
  isSelectionLayout.value = isSelection;
  // Transition hooks run before Vue flushes this reactive class update. Apply
  // it immediately as well so the target measurement uses the correct layout.
  dockContainer.value?.classList.toggle("fab-mode", isSelection);
}

/**
 * Freeze the outgoing rail before Vue removes it. Without this lock, the
 * fixed-position container resolves its new intrinsic width in one layout
 * frame, making the glass surface snap before the incoming controls appear.
 */
function prepareDockSwap() {
  const element = dockContainer.value;
  if (!element) return;

  stopResizeFrame();
  previousSize = measureDock(element);
  lockDockSize(element, previousSize);
  isSwapping.value = true;
}

/**
 * Vue has mounted the incoming mode by this hook. Temporarily release the
 * lock to obtain its natural footprint, restore the old footprint, then move
 * to the new one on the next frame. This keeps desktop's content-sized dock
 * and mobile's full-width navigation rail intact while animating between them.
 */
function animateDockSwap() {
  const element = dockContainer.value;
  if (!element) return;

  const from = previousSize ?? measureDock(element);
  setSelectionLayout(!dockVisible.value);
  clearDockSizeLock();
  const to = measureDock(element);
  lockDockSize(element, from);

  // Force the locked dimensions to commit before their transition target is set.
  void element.offsetWidth;
  resizeFrame = window.requestAnimationFrame(() => {
    lockDockSize(element, to);
    resizeFrame = null;
  });
}

function finishDockSwap() {
  stopResizeFrame();
  clearDockSizeLock();
  previousSize = null;
  isSwapping.value = false;
}
</script>

<template>
  <div
    ref="dockContainer"
    class="dock-container"
    :class="{
      'fab-mode': isSelectionLayout,
      'is-desktop': isDesktop,
      'is-swapping': isSwapping,
    }"
  >
    <Transition
      name="dock-swap"
      mode="out-in"
      @before-leave="prepareDockSwap"
      @before-enter="animateDockSwap"
      @after-enter="finishDockSwap"
      @enter-cancelled="finishDockSwap"
      @leave-cancelled="finishDockSwap"
    >
      <!-- Navigation Dock Mode -->
      <div
        v-if="dockVisible"
        key="navigation"
        class="dock-mode"
      >
        <NavigationDock />
      </div>

      <!-- Selection FAB Mode -->
      <div
        v-else
        key="selection"
        class="dock-mode"
      >
        <SelectionFab />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.dock-container {
  position: fixed;
  /* Respect safe area insets for notched devices + Showcase Frame */
  bottom: calc(var(--sys-space-24) + env(safe-area-inset-bottom) + var(--safe-frame-offset, 0px));
  left: 50%;
  transform: translate3d(-50%, 0, 0);
  background: var(--sys-surface-glass);

  border: 1px solid var(--sys-surface-glass-border);
  padding: var(--sys-space-6);
  border-radius: var(--sys-shape-corner-full);
  display: flex;
  gap: var(--sys-space-6);
  box-shadow:
    0 12px 40px var(--sys-overlay-dark-strong),
    0 0 0 1px var(--sys-overlay-light-subtle);
  z-index: var(--sys-z-dock);
  /* Disable double-tap zoom delay */
  touch-action: manipulation;
  pointer-events: auto;
  user-select: none;
  contain: layout paint style;
  isolation: isolate;
  will-change: width, height, bottom, box-shadow;
  transition:
    width var(--sys-motion-duration-300) var(--sys-motion-easing-decelerate),
    height var(--sys-motion-duration-300) var(--sys-motion-easing-decelerate),
    bottom var(--sys-motion-duration-200) var(--sys-motion-easing-decelerate),
    box-shadow var(--sys-motion-duration-200) var(--sys-motion-easing-decelerate),
    background var(--sys-motion-duration-200) var(--sys-motion-easing-decelerate),
    border-color var(--sys-motion-duration-200) var(--sys-motion-easing-decelerate);
}

@media (hover: hover) and (pointer: fine) {
  .dock-container:hover {
    bottom: calc(var(--sys-space-28) + env(safe-area-inset-bottom) + var(--safe-frame-offset, 0px));
    box-shadow: 0 16px 48px var(--sys-overlay-dark-strong);
  }
}

/* FAB Mode Styling */
.dock-container.fab-mode {
  flex-direction: row;
  align-items: center;
  /* Prevent flex items from wrapping on smaller screens */
  flex-wrap: nowrap;
}

/* The temporary width lock avoids a reflow snap. Clipping only during that
   brief handoff prevents an entering action row from painting outside the
   glass rail while it expands. */
.dock-container.is-swapping {
  overflow: clip;
}

.dock-mode {
  display: flex;
  align-items: center;
  min-width: 0;
}

.dock-swap-enter-active,
.dock-swap-leave-active {
  transition:
    opacity var(--sys-motion-duration-300) var(--sys-motion-easing-decelerate),
    transform var(--sys-motion-duration-300) var(--sys-motion-easing-decelerate);
  transform-origin: center bottom;
  will-change: opacity, transform;
}

.dock-swap-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.96);
}

.dock-swap-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.985);
}

@media (max-width: 600px) {
  .dock-container {
    width: calc(100% - var(--sys-space-32));
    max-width: 460px;
    padding: var(--sys-space-4);
    gap: var(--sys-space-4);
  }
  /* Ensure FAB mode shrink-wraps on mobile to avoid empty space */
  .dock-container.fab-mode {
    width: auto;
    max-width: calc(100% - 32px);
    justify-content: center;
  }

  /* Navigation renders through an animation wrapper. That wrapper must claim
     the dock's full mobile width; otherwise its flex children size to their
     content and leave the rest of the glass rail empty. Selection mode stays
     deliberately content-sized above. */
  .dock-container:not(.fab-mode) .dock-mode {
    flex: 1 1 auto;
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dock-container.is-swapping {
    transition: none;
  }

  .dock-swap-enter-active,
  .dock-swap-leave-active {
    transition: opacity var(--sys-motion-duration-200) linear;
  }

  .dock-swap-enter-from,
  .dock-swap-leave-to {
    transform: none;
  }
}
</style>
