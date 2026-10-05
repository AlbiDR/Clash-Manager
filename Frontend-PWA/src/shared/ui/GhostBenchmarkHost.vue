<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { computed, ref, useTemplateRef, watch, nextTick, onMounted, onUnmounted } from "vue";
import { useGhostBenchmarkState } from "../directives/ghostBenchmarkState";
import { usePointerCapability } from "../composables/usePointerCapability";
import BenchmarkContent from "./BenchmarkContent.vue";
import Icon from "./Icon.vue";

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
const { active, hide, ignoreBackdropClick } = useGhostBenchmarkState();
const { isCoarsePointer } = usePointerCapability();
const isScore = computed(() => typeof active.value?.content === "object" && "kind" in active.value.content);
const scoreExpanded = ref(false);
const scoreKey = computed(() => {
  const content = active.value?.content;
  return typeof content === "object" && "kind" in content ? `${content.context}:${content.name}` : undefined;
});
watch(scoreKey, () => { scoreExpanded.value = false; });
const sheetEl = useTemplateRef<HTMLElement>("sheetEl");
let returnFocus: HTMLElement | null = null;

function handleKeydown(event: KeyboardEvent) {
  if (!active.value || !isScore.value) return;
  if (event.key === "Escape") { event.preventDefault(); hide(); return; }
  if (event.key !== "Tab") return;
  const panel = isCoarsePointer.value ? sheetEl.value : popoverEl.value;
  const controls = [...panel?.querySelectorAll<HTMLElement>("button:not(:disabled), summary") ?? []].filter(control => {
    // Closed disclosures keep their descendants in the DOM but out of the tab order.
    for (let ancestor = control.parentElement; ancestor && ancestor !== panel; ancestor = ancestor.parentElement) {
      if (ancestor instanceof HTMLDetailsElement && !ancestor.open && !ancestor.querySelector("summary")?.contains(control)) return false;
    }
    return true;
  });
  if (!controls?.length) return;
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function handleOutsidePointer(event: PointerEvent) {
  if (!isScore.value || isCoarsePointer.value) return;
  const target = event.target as HTMLElement;
  if (!popoverEl.value?.contains(target) && !target.closest("[data-score-explanation]")) hide();
}

// --- Desktop popover positioning ---

/** Reactive reference to the desktop popover DOM element. */
const popoverEl = useTemplateRef<HTMLElement>("popoverEl");

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

  if (translateY === "0%") top = Math.min(top, Math.max(padding, window.innerHeight - tipRect.height - padding));
  popoverStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
    transform: `translateX(-50%) translateY(${translateY})`,
  };
}

async function onScoreExpanded(expanded: boolean) {
  scoreExpanded.value = expanded;
  await nextTick();
  positionPopover();
}

// Watch active state to reposition popover on fine pointers
watch(active, async (value, previous) => {
  if (value && isScore.value && !(typeof previous?.content === "object" && "kind" in previous.content)) returnFocus = document.activeElement as HTMLElement;
  if (!value && returnFocus) { returnFocus.focus(); returnFocus = null; }
  if (value && isScore.value) {
    await nextTick();
    (isCoarsePointer.value ? sheetEl.value : popoverEl.value)?.querySelector<HTMLElement>("button")?.focus();
  }
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
  if (active.value && !isCoarsePointer.value && !isScore.value) hide();
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
  if (isScore.value && !(e.target as HTMLElement).closest(".bc-sheet-handle")) return;
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

/**
 * Dismisses the sheet on a backdrop tap, except for the leftover click of the
 * touch that opened it (see `ignoreBackdropClick`).
 */
function onBackdropClick() {
  if (ignoreBackdropClick.value) {
    ignoreBackdropClick.value = false;
    return;
  }
  hide();
}

/** Any new touch ends the opening gesture, so its leftover click can no longer arrive. */
function onGestureStart() {
  ignoreBackdropClick.value = false;
}

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
  window.addEventListener("pointerdown", handleOutsidePointer);
  window.addEventListener("resize", positionPopover);
  window.addEventListener("scroll", handleScroll, { passive: true });
  window.addEventListener("pointerdown", onGestureStart, { capture: true, passive: true });
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
  window.removeEventListener("pointerdown", handleOutsidePointer);
  window.removeEventListener("resize", positionPopover);
  window.removeEventListener("scroll", handleScroll);
  window.removeEventListener("pointerdown", onGestureStart, { capture: true });
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
        :class="{ 'bc-popover--score': isScore, 'bc-popover--expanded': isScore && scoreExpanded }"
        :role="isScore ? 'dialog' : undefined"
        :aria-modal="isScore ? 'true' : undefined"
        :aria-label="isScore ? 'Score explanation' : undefined"
        :style="popoverStyle"
      >
        <button
          v-if="isScore"
          type="button"
          class="bc-close"
          aria-label="Close score explanation"
          @click="hide"
        >
          <Icon
            name="close"
            size="20"
          />
        </button>
        <BenchmarkContent
          :key="scoreKey"
          :data="active.content"
          @expanded="onScoreExpanded"
          @toggle.capture="positionPopover"
        />
      </div>
    </Transition>

    <Transition name="bc-sheet">
      <div
        v-if="active && isCoarsePointer"
        class="bc-sheet-backdrop"
        :class="{ 'bc-sheet-backdrop--score': isScore }"
        @click.self="onBackdropClick"
      >
        <div
          ref="sheetEl"
          class="bc-sheet"
          :class="{ 'bc-sheet--score': isScore, dragging: isDragging }"
          :role="isScore ? 'dialog' : undefined"
          :aria-modal="isScore ? 'true' : undefined"
          :aria-label="isScore ? 'Score explanation' : undefined"
          :style="{ transform: dragOffset ? `translateY(${dragOffset}px)` : undefined }"
          @touchstart="onSheetTouchStart"
          @touchmove="onSheetTouchMove"
          @touchend="onSheetTouchEnd"
        >
          <div class="bc-sheet-handle" />
          <button
            v-if="isScore"
            type="button"
            class="bc-close"
            aria-label="Close score explanation"
            @click="hide"
          >
            <Icon
              name="close"
              size="20"
            />
          </button>
          <div
            v-if="active.stepper"
            class="bc-stepper"
          >
            <button
              type="button"
              class="bc-step"
              aria-label="Show earlier entry"
              :disabled="active.stepper.position <= 1"
              @click="active.stepper.go(-1)"
            >
              <Icon
                name="chevron_left"
                size="24"
              />
            </button>
            <div class="bc-stepper-body">
              <BenchmarkContent :data="active.content" />
              <span class="bc-stepper-position">{{ active.stepper.position }} / {{ active.stepper.total }}</span>
            </div>
            <button
              type="button"
              class="bc-step"
              aria-label="Show later entry"
              :disabled="active.stepper.position >= active.stepper.total"
              @click="active.stepper.go(1)"
            >
              <Icon
                name="chevron_right"
                size="24"
              />
            </button>
          </div>
          <BenchmarkContent
            v-else
            :key="scoreKey"
            :data="active.content"
            @expanded="onScoreExpanded"
          />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Score explanations are explicit, persistent interactions within the same host. */
.bc-popover.bc-popover--score {
  --score-content-max-height: calc(100dvh - var(--sys-space-24) - var(--sys-space-48) - var(--sys-space-24));
  background: var(--sys-color-surface-container);
  max-height: calc(100dvh - var(--sys-space-24));
  overflow: hidden;
  overscroll-behavior: contain;
  pointer-events: auto;
  padding: var(--sys-space-24);
  padding-top: var(--sys-space-48);
}
.bc-popover.bc-popover--expanded {
  width: min(var(--sys-layout-score-popup-width), calc(100vw - var(--sys-space-24)));
}
.bc-sheet.bc-sheet--score {
  --score-content-max-height: calc(100dvh - var(--sys-safe-top) - var(--sys-space-24) - var(--sys-space-48) - var(--sys-space-24) - var(--sys-safe-bottom));
  background: var(--sys-color-surface-container);
  position: relative;
  padding-top: var(--sys-space-48);
  max-height: calc(100dvh - var(--sys-safe-top) - var(--sys-space-24));
  overflow: hidden;
  overscroll-behavior: contain;
}
.bc-sheet--score .bc-sheet-handle { position: absolute; top: var(--sys-space-12); left: 50%; transform: translateX(-50%); margin: 0; }
.bc-sheet-backdrop--score { touch-action: pan-y; }
.bc-close {
  position: absolute;
  top: var(--sys-space-4);
  right: var(--sys-space-4);
  display: grid;
  place-items: center;
  width: var(--sys-space-48);
  height: var(--sys-space-48);
  padding: 0;
  border: 0;
  border-radius: var(--sys-shape-corner-full);
  background: transparent;
  color: var(--sys-color-on-surface-variant);
  cursor: pointer;
}
.bc-close:focus-visible { outline: var(--sys-space-2) solid var(--sys-color-primary); outline-offset: calc(-1 * var(--sys-space-4)); }
@media (prefers-reduced-motion: reduce) {
  .bc-popover-enter-active, .bc-popover-leave-active,
  .bc-sheet-enter-active, .bc-sheet-leave-active,
  .bc-sheet-enter-active .bc-sheet, .bc-sheet-leave-active .bc-sheet { transition: none; }
}

/* Desktop hover popover */
.bc-popover {
  position: fixed;
  background: var(--sys-surface-glass);
  color: var(--sys-color-on-surface);
  padding: var(--sys-space-16);
  border-radius: var(--sys-shape-corner-m);
  width: 200px;
  z-index: var(--sys-z-tooltip);
  border: 0.5px solid var(--sys-overlay-light-medium);
  box-shadow: 0 8px 32px var(--sys-overlay-dark-soft), 0 2px 8px var(--sys-overlay-dark-soft);
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
  background: var(--sys-overlay-dark-strong);
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
  padding-bottom: calc(var(--sys-space-24) + var(--sys-safe-bottom));
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

/* Series stepper: arrows flank the content so a mistapped entry is one tap away. */
.bc-stepper {
  display: grid;
  grid-template-columns: var(--sys-space-44) 1fr var(--sys-space-44);
  align-items: center;
  gap: var(--sys-space-8);
}

.bc-stepper-body {
  display: grid;
  gap: var(--sys-space-6);
  justify-items: center;
  text-align: center;
  min-width: 0;
}

.bc-stepper-position {
  color: var(--sys-color-outline);
  font-family: var(--sys-font-family-mono);
  font-size: var(--sys-typescale-label-sm);
  font-weight: 800;
  letter-spacing: var(--sys-tracking-wide);
  line-height: var(--sys-leading-none);
}

.bc-step {
  display: grid;
  place-items: center;
  width: var(--sys-space-44);
  height: var(--sys-space-44);
  padding: 0;
  color: var(--sys-color-primary);
  background: var(--sys-color-surface-container-highest);
  border: 0;
  border-radius: var(--sys-shape-corner-full);
  cursor: pointer;
  touch-action: manipulation;
  transition:
    opacity var(--sys-motion-duration-200) var(--sys-motion-easing-standard),
    background-color var(--sys-motion-duration-200) var(--sys-motion-easing-standard);
}

.bc-step:active:not(:disabled) {
  background: var(--sys-color-secondary-container);
}

.bc-step:disabled {
  opacity: 0.3;
  cursor: default;
}

.bc-step:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--sys-color-primary);
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
