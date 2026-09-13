<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { Icon, vTactile, useHaptics } from "@shared";
import { onUnmounted, ref, watch } from "vue";
const props = defineProps<{
  title: string;
  icon: string;
  loading?: boolean;
  bodyClass?: string;
  initiallyExpanded?: boolean;
}>();

/** Follows the body's size while a card opens, so async content is not clipped. */
let heightTracker: ResizeObserver | null = null;

const haptics = useHaptics();
const isCollapsed = ref(!props.initiallyExpanded);

/**
 * [DECISION LOG] OPENS ON BECOMING RELEVANT, NEVER CLOSES ON ITS OWN.
 *
 * @remarks
 * `initiallyExpanded` was read once at setup, which is correct for a static
 * caller but wrong for one whose answer arrives later: the Event Management
 * card asks to be open while a Voyage is running, and that store hydrates after
 * mount, so the card stayed shut through the one state it exists to report.
 *
 * [THREAT:] Mirroring the flag in both directions would let a background
 * refresh collapse a card mid-read, so a card that has become relevant opens
 * and then stays under the reader's control.
 */
watch(
  () => props.initiallyExpanded,
  (isNowExpanded) => {
    if (isNowExpanded) isCollapsed.value = false;
  },
);

/**
 * Expand and collapse, animated on a real measured height.
 *
 * @remarks
 * [DECISION LOG] MEASURED, NOT GUESSED:
 * This animated `max-height` between a fixed 1000px and 0. That value is not
 * the height of any card, and the clip only becomes visible once the ceiling
 * drops below the real content height, so a short card spent most of the 300ms
 * apparently doing nothing and then snapped shut, while a tall one moved the
 * whole way. Nine cards of different lengths opened at nine apparent speeds,
 * and any card taller than 1000px would have been truncated outright.
 *
 * The interpolable `grid-template-rows: 0fr -> 1fr` technique was tried first
 * and does not work here: with padding and a border on the inner element the
 * `fr` track resolves to the padding alone (measured at 33px against 363px of
 * content), whatever `min-height` is set to. Measuring `scrollHeight` and
 * animating to it is exact, and the duration means the same thing on every
 * card.
 *
 * [THREAT:] Leaving an inline height behind after expanding would freeze the
 * card at its opening height, so a panel that grows later - a settings list
 * that reveals a row, a toast, an async load - would be clipped. The height is
 * handed back to `auto` once the transition finishes.
 *
 * @param element - The transitioning wrapper.
 */
function onCollapseEnter(element: Element): void {
  const wrapper = element as HTMLElement;
  wrapper.style.height = "0px";

  // [THREAT:] Measuring in the same frame the element is inserted reports the
  // padding alone - 32px against a card several hundred tall - because the
  // slotted children have not laid out yet. Forcing a reflow does not help: the
  // children are not there to measure. Deferring one frame lets them render,
  // and only then is scrollHeight the height this card will actually be.
  requestAnimationFrame(() => {
    wrapper.style.height = `${wrapper.scrollHeight}px`;
  });

  // [THREAT:] One frame is enough for content that renders synchronously and
  // not for content that does not. Event Management draws from a store that
  // resolves a beat later, so its body really is padding-only when the frame is
  // measured and several hundred pixels tall immediately after - the card then
  // animated to 32px and jumped the remaining 350. Following the body's size
  // for the length of the transition keeps the target honest whenever it
  // arrives.
  const body = wrapper.firstElementChild;
  if (!body || typeof ResizeObserver === "undefined") return;

  stopTrackingHeight();
  heightTracker = new ResizeObserver(() => {
    wrapper.style.height = `${wrapper.scrollHeight}px`;
  });
  heightTracker.observe(body);
}

/** Stops following the body's size, once the card is settled or on teardown. */
function stopTrackingHeight(): void {
  heightTracker?.disconnect();
  heightTracker = null;
}

/**
 * Releases the measured height once the card is open.
 *
 * @param element - The transitioning wrapper.
 */
function onCollapseAfterEnter(element: Element): void {
  stopTrackingHeight();
  (element as HTMLElement).style.height = "";
}

/**
 * Collapses from the card's current height rather than from a guess.
 *
 * @param element - The transitioning wrapper.
 */
function onCollapseLeave(element: Element): void {
  stopTrackingHeight();
  const wrapper = element as HTMLElement;
  wrapper.style.height = `${wrapper.scrollHeight}px`;
  void wrapper.offsetHeight;
  wrapper.style.height = "0px";
}

onUnmounted(stopTrackingHeight);

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
    <div
      v-tactile
      class="card-header"
      @click="toggleCollapse"
    >
      <div class="header-main">
        <Icon
          :name="icon"
          size="20"
          class="header-icon"
        />
        <h3 data-bone="SettingsCard.title">
          {{ title }}
        </h3>
      </div>
      <div class="header-actions">
        <slot name="header-extra" />
        <button
          class="expand-btn"
          :class="{ rotated: !isCollapsed }"
          :aria-expanded="!isCollapsed"
          :aria-label="isCollapsed ? `Expand ${title} section` : `Collapse ${title} section`"
        >
          <Icon
            name="chevron_down"
            size="18"
          />
        </button>
      </div>
    </div>
    <Transition
      name="collapse"
      @enter="onCollapseEnter"
      @after-enter="onCollapseAfterEnter"
      @leave="onCollapseLeave"
    >
      <div
        v-if="!isCollapsed"
        class="card-body-wrap"
      >
        <div
          class="card-body"
          :class="bodyClass"
        >
          <slot />
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.settings-card {
  background: var(--sys-color-surface-container);
  /* Bound to the same token as SkeletonSettingsCard's, so the pair cannot
     drift apart again without both moving. */
  border-radius: var(--sys-shape-corner-small);
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
  min-height: var(--sys-space-56);
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

/* [DECISION LOG] AN 18px GLYPH IS NOT A 48px CONTROL:
   Padding of 4px around an 18px chevron produced a 26x26 button on every card.
   The whole header is clickable, so a pointer rarely misses, but this button is
   the focusable element and the keyboard target, and it is what a screen reader
   moves to. The bleed reaches 48x48 without changing the drawn glyph or
   disturbing the header's 56px row. */
.expand-btn {
  position: relative;
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

.expand-btn::after {
  content: "";
  position: absolute;
  /* 12px rather than the exact 11px needed, because the spacing scale is even
     numbered. 50x50 clears the minimum; 44 would not have. */
  inset: calc(-1 * var(--sys-space-12));
}

.expand-btn.rotated {
  transform: rotate(180deg);
  opacity: 1;
  color: var(--sys-color-primary);
}

.card-body {
  padding: var(--sys-space-16);
}

/* [DECISION LOG] THE bodyClass CONTRACT IS HONOURED HERE:
   `bodyClass` lands on `.card-body`, which this component owns, so a modifier
   for it has to be declared in this scoped block. BackendRefresher declared
   its own `.no-padding` and passed the name across, where Vue's scoped
   attribute made it unmatchable - the card kept its inset and the rows it
   meant to run edge to edge sat 20px in from every other settings card's 16px.
   Full-bleed rows with dividers that reach the card edges is a settings
   pattern worth having, so the modifier lives here rather than being deleted. */
.card-body.no-padding {
  padding: 0;
}

/* Height is set inline by the transition hooks from a real measurement; this
   rule only supplies the timing and the clipping while it runs. */
.collapse-enter-active,
.collapse-leave-active {
  overflow: hidden;
  transition:
    height var(--sys-motion-duration-300) var(--sys-motion-easing-standard),
    opacity var(--sys-motion-duration-200) var(--sys-motion-easing-standard);
}

.collapse-enter-from,
.collapse-leave-to {
  opacity: 0;
}


</style>
