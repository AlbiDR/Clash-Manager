<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { Icon, vTactile, useHaptics } from "@shared";
import { ref, watch } from "vue";
const props = defineProps<{
  title: string;
  icon: string;
  loading?: boolean;
  bodyClass?: string;
  initiallyExpanded?: boolean;
}>();

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
    <Transition name="collapse">
      <div
        v-if="!isCollapsed"
        class="card-body"
        :class="bodyClass"
      >
        <slot />
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
