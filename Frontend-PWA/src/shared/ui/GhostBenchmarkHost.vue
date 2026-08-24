<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from "vue";
import { useGhostBenchmarkState } from "../directives/ghostBenchmarkState";
import { usePointerCapability } from "../composables/usePointerCapability";
import BenchmarkContent from "./BenchmarkContent.vue";

/**
 * [UI] GHOST BENCHMARK HOST
 * ----------------------------------------------------------------------------
 * Rationale: Single global singleton, mounted once in App.vue alongside
 * ConfirmDialog/ToastContainer. Reads the shared ghost-benchmark state
 * populated by the `v-tooltip` directive and renders the platform-tailored
 * presentation: a positioned hover popover for fine pointers (desktop), or
 * a swipe-to-dismiss bottom sheet for coarse pointers (mobile).
 * Layer: @shared/ui
 * ----------------------------------------------------------------------------
 */
const { active, hide } = useGhostBenchmarkState();
const { isCoarsePointer } = usePointerCapability();

// --- Desktop popover positioning ---

/** Reactive reference to the desktop popover DOM element. */
const popoverEl = ref<HTMLElement | null>(null);

/** Reactive inline style rules applied to position the desktop popover. */
const popoverStyle = ref<Record<string, string>>({});

/**
 * Calculates and updates the coordinates of the desktop popover dynamically.
 *
 * @remarks
 * Centers the popover above the anchor element. If constrained by top viewport boundaries,
 * repositions the popover below the anchor element to prevent vertical clipping. Clamps
 * horizontal positioning to avoid leaking outside the viewport edges.
 */
function positionPopover() {
  const rect = active.value?.anchorRect;
  const el = popoverEl.value;
  if (!rect || !el) return;

  const viewportWidth = window.innerWidth;
  const padding = 12;
  const tipRect = el.getBoundingClientRect();

  let left = rect.left + rect.width / 2;
  const halfWidth = tipRect.width / 2;
  if (left - halfWidth < padding) left = halfWidth + padding;
  else if (left + halfWidth > viewportWidth - padding) left = viewportWidth - halfWidth - padding;

  let top = rect.top - 8;
  let translateY = "-100%";
  if (rect.top < tipRect.height + padding * 2) {
    top = rect.bottom + 8;
    translateY = "0%";
  }

  popoverStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
    transform: `translateX(-50%) translateY(${translateY})`,
  };
}

// Watch active state to reposition popover on fine pointers
watch(active, async (value) => {
  if (value && !isCoarsePointer.value) {
    await nextTick();
    positionPopover();
  }
});

/**
 * Dismisses the fine pointer popover on viewport scroll to prevent alignment drift.
 */
function handleScroll() {
  // Matches the pre-existing behavior: the desktop popover is anchor-relative
  // and does not track scroll, so it dismisses on any scroll instead.
  if (active.value && !isCoarsePointer.value) hide();
}

// --- Mobile sheet: scroll lock + swipe-to-dismiss ---

/** Vertical translation offset in pixels during mobile slide/drag gestures. */
const dragOffset = ref(0);

/** True when the mobile bottom sheet drag gesture is currently active. */
const isDragging = ref(false);

/** Vertical screen coordinate in pixels where the mobile touch sequence initiated. */
let touchStartY = 0;

// Watch active state to enforce/restore body scroll-lock on mobile devices
watch(active, (value) => {
  if (!isCoarsePointer.value) return;
  document.body.style.overflow = value ? "hidden" : "";
});

/**
 * Registers the initial vertical touch point on mobile swipe initiation.
 *
 * @param e - The native TouchEvent payload.
 */
function onSheetTouchStart(e: TouchEvent) {
  touchStartY = e.touches[0].clientY;
  isDragging.value = true;
}

/**
 * Tracks swipe translation vertically, clamping upwards drags.
 *
 * @param e - The native TouchEvent payload.
 */
function onSheetTouchMove(e: TouchEvent) {
  if (!isDragging.value) return;
  dragOffset.value = Math.max(0, e.touches[0].clientY - touchStartY);
}

/**
 * Handles the release of swipe/touch drag. Dismisses bottom sheet if vertical distance > 80px.
 */
function onSheetTouchEnd() {
  if (!isDragging.value) return;
  isDragging.value = false;
  if (dragOffset.value > 80) {
    hide();
  }
  dragOffset.value = 0;
}

onMounted(() => {
  window.addEventListener("scroll", handleScroll, { passive: true });
});

onUnmounted(() => {
  window.removeEventListener("scroll", handleScroll);
  document.body.style.overflow = "";
});
</script>

<template>
  <Teleport to="body">
    <Transition name="bc-popover">
      <div
        v-if="active && !isCoarsePointer"
        ref="popoverEl"
        class="bc-popover"
        :style="popoverStyle"
      >
        <BenchmarkContent :data="active.content" />
      </div>
    </Transition>

    <Transition name="bc-sheet">
      <div
        v-if="active && isCoarsePointer"
        class="bc-sheet-backdrop"
        @click.self="hide"
      >
        <div
          class="bc-sheet"
          :class="{ dragging: isDragging }"
          :style="{ transform: dragOffset ? `translateY(${dragOffset}px)` : undefined }"
          @touchstart="onSheetTouchStart"
          @touchmove="onSheetTouchMove"
          @touchend="onSheetTouchEnd"
        >
          <div class="bc-sheet-handle" />
          <BenchmarkContent :data="active.content" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Desktop hover popover */
.bc-popover {
  position: fixed;
  background: var(--sys-surface-glass);
  color: var(--sys-color-on-surface);
  padding: var(--sys-space-16);
  border-radius: var(--sys-shape-corner-m);
  width: 200px;
  z-index: var(--sys-z-tooltip);
  border: 0.5px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08);
  pointer-events: none;
  contain: content;
}

.bc-popover-enter-active,
.bc-popover-leave-active {
  transition: opacity var(--sys-motion-duration-200) ease;
}
.bc-popover-enter-from,
.bc-popover-leave-to {
  opacity: 0;
}

/* Mobile bottom sheet */
.bc-sheet-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: var(--sys-z-overlay);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  touch-action: none;
}

.bc-sheet {
  width: 100%;
  max-width: var(--sys-layout-max-width);
  background: var(--sys-surface-glass);
  border: 1px solid var(--sys-surface-glass-border);
  border-radius: var(--sys-shape-corner-l) var(--sys-shape-corner-l) 0 0;
  padding: var(--sys-space-12) var(--sys-space-24);
  padding-bottom: calc(var(--sys-space-24) + env(safe-area-inset-bottom));
  box-shadow: var(--sys-elevation-3);
  transition: transform var(--sys-motion-duration-250) var(--sys-motion-spring);
}
.bc-sheet.dragging {
  transition: none;
}

.bc-sheet-handle {
  width: 36px;
  height: 4px;
  border-radius: var(--sys-shape-corner-full);
  background: var(--sys-color-outline-variant);
  margin: 0 auto var(--sys-space-16);
}

.bc-sheet-enter-active,
.bc-sheet-leave-active {
  transition: opacity var(--sys-motion-duration-250) ease;
}
.bc-sheet-enter-from,
.bc-sheet-leave-to {
  opacity: 0;
}
.bc-sheet-enter-active .bc-sheet,
.bc-sheet-leave-active .bc-sheet {
  transition: transform var(--sys-motion-duration-300) var(--sys-motion-spring);
}
.bc-sheet-enter-from .bc-sheet,
.bc-sheet-leave-to .bc-sheet {
  transform: translateY(100%);
}
</style>
