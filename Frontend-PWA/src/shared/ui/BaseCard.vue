<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import Icon from "./Icon.vue";
import { useCardMechanics } from "../composables/useCardMechanics";
import { scoreTintStyle } from "../utils/scoreTint";

/**
 * COMPONENT: BaseCard
 * ----------------------------------------------------------------------------
 * Rationale: Authoritative container molecule for interactive cards (Roster members,
 * Recruits, Laboratory targets) providing standardized selection, expand/collapse,
 * and score-tint visual representations across all features.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * Satisfies ADR Section II: Mobile WebView Ergonomics & Target B.2.
 * Enforces declarative tactile feedback via `v-tactile` directive while delegating tap,
 * long-press, and selection mechanics to `useCardMechanics`. Maintains layout isolation
 * and composited motion performance in hybrid WebView views.
 *
 * **Decision Log - Touch Interactions & Rendering Performance:**
 * - Gesture Disambiguation: Single tap toggles selection mode or expands details depending
 *   on global selection state, whereas long-press explicitly triggers selection mode.
 * - Threat Vector - Layout Thrashing & Animation Jitter: CSS properties in `.card` avoid
 *   animating layout geometry like `height`/`width`; transitions are restricted to composited
 *   transform, box-shadow, and color opacity properties to prevent main-thread dropped frames.
 */

const props = defineProps<{
  /**
   * Unique DOM identifier for accessibility and DOM element targeting.
   */
  id: string;

  /**
   * Indicates whether the card is in an expanded detail view state.
   */
  expanded: boolean;

  /**
   * Indicates whether the card is currently selected within multi-selection mode.
   */
  selected: boolean;

  /**
   * Active state flag of the parent container's batch/multi-selection mode.
   */
  selectionMode: boolean;

  /**
   * Optional flag highlighting whether the entity has been explicitly tagged or bookmarked.
   */
  isTagged?: boolean;

  /**
   * Numeric score value used to derive score-tint background styles dynamically.
   */
  score?: number;
}>();

const emit = defineEmits<{
  /**
   * Emitted when the user requests expansion/collapse toggling of card details.
   */
  toggle: [];

  /**
   * Emitted when the card selection state toggles during batch mode or tap/long-press.
   */
  "toggle-select": [];

  /**
   * Emitted when the user directly taps the score badge stat-pod.
   *
   * @param clickEvent - The mouse or touch event emitted upon score badge interaction.
   */
  "score-click": [clickEvent: Event];
}>();

// Reusable card mechanics orchestrator managing tap dispatches, long-press timer loops, and score clicks
const {
  handleTap,
  handleLongPress,
  handleScoreClick: internalScoreClick,
  handleExpandClick: internalExpandClick,
} = useCardMechanics(props, {
  onExpand: () => emit("toggle"),
  onSelect: () => emit("toggle-select"),
});

/**
 * Intercepts score badge interaction events, executes internal card mechanics state handling,
 * and re-emits a standardized Event payload to parent observers.
 *
 * // Decision: Stop event propagation in template and delegate event normalizations cleanly
 * // Threat: Untrapped touch propagation triggering parent list scroll locks or inadvertent card selection
 *
 * @param cardScoreClickEvent - Raw touch or mouse interaction payload on score container.
 */
function handleScoreClick(cardScoreClickEvent: MouseEvent | TouchEvent) {
  internalScoreClick(cardScoreClickEvent);
  emit("score-click", cardScoreClickEvent as Event);
}
</script>

<template>
  <div
    :id="props.id"
    class="card squish-interaction"
    :class="{ expanded: props.expanded, selected: props.selected, tagged: props.isTagged }"
    role="article"
    v-bind="{ 'aria-expanded': props.expanded }"
    v-tactile="{ onTap: handleTap, onLongPress: handleLongPress }"
  >
    <div class="card-header">
      <div class="identity-group">
        <!-- SLOT: Meta Stack (Badges, Time, Tags) -->
        <div class="meta-stack">
          <slot name="identity-meta"></slot>
        </div>

        <!-- SLOT: Name Block (Name, Trophy Count) -->
        <div class="name-block">
          <slot name="identity-name"></slot>
        </div>
      </div>

      <div class="header-actions">
        <!-- Score Section -->
        <div class="score-section" @click.stop="handleScoreClick">
          <div
            class="stat-pod hit-target"
            :class="{ 'score-tint': props.score !== undefined }"
            :style="scoreTintStyle(props.score)"
          >
            <slot name="score-section"></slot>
          </div>
        </div>

        <!-- Expand Button -->
        <button
          class="expand-btn hit-target"
          @click.stop="internalExpandClick"
          :class="{ 'is-active': props.expanded }"
          v-bind="{ 'aria-expanded': props.expanded, 'aria-label': 'Expand details' }"
        >
          <Icon name="chevron_down" size="20" />
        </button>
      </div>
    </div>

    <!-- Expanded Content -->
    <div class="card-body" v-if="props.expanded">
      <slot name="expanded-content"></slot>
    </div>
  </div>
</template>

<style scoped>
.card {
  background: var(--sys-color-surface-container);
  border-radius: var(--sys-shape-corner-m);
  padding: var(--sys-space-12) var(--sys-space-16);
  margin-bottom: var(--sys-space-8);
  border: 1.5px solid transparent;
  cursor: pointer;
  position: relative;
  overflow: visible;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  touch-action: pan-y;
  /* [PERF] OPTIMIZED: Removed 'all', strictly animates composited properties + colors */
  transition:
    transform var(--sys-motion-duration-200) var(--sys-motion-spring),
    background-color var(--sys-motion-duration-200) ease,
    border-color var(--sys-motion-duration-200) ease,
    box-shadow var(--sys-motion-duration-250) ease,
    margin var(--sys-motion-duration-300) var(--sys-motion-easing-standard);
  box-shadow: 0 0 0 rgba(0, 0, 0, 0);

  /* [PERF] PERFORMANCE: Removed 'paint' containment to allow shadow/scale bleed */
  contain: layout style;
  content-visibility: auto;
}

.card.expanded {
  background: var(--sys-color-surface-container-high);
  box-shadow: var(--sys-elevation-3);
  margin-top: var(--sys-space-16);
  margin-bottom: var(--sys-space-16);
  transform: scale(1.02);
  border-color: rgba(var(--sys-color-primary-rgb), 0.3);
  z-index: 10;
  contain: none;
  content-visibility: visible;
  contain-intrinsic-size: auto 300px;
}

.card.selected {
  background: var(--sys-color-primary-container) !important;
  border: 2.5px solid var(--sys-color-primary);
  transform: scale(0.97);
  box-shadow: 0 4px 12px rgba(var(--sys-color-primary-rgb), 0.15);
}

.card.tagged:not(.selected) {
  border: 1.5px solid rgba(var(--sys-color-primary-rgb), 0.4);
  background: linear-gradient(
    135deg,
    var(--sys-color-surface-container),
    rgba(var(--sys-color-primary-rgb), 0.03)
  );
  box-shadow: 0 2px 8px rgba(var(--sys-color-primary-rgb), 0.05);
}

/* Deep selectors to style slotted content when selected */
.card.selected :deep(.player-name),
.card.selected :deep(.trophy-val),
.card.selected :deep(.stat-score),
.card.selected :deep(.stat-item .label),
.card.selected :deep(.stat-item .value),
.card.selected :deep(.trend-val),
.card.selected :deep(.expand-btn),
.card.selected :deep(.sc-label),
.card.selected :deep(.sc-val) {
  color: var(--sys-color-on-primary-container) !important;
  opacity: 1 !important;
}

.card.selected :deep(.stat-pod) {
  background: rgba(
    var(--sys-color-on-primary-container-rgb),
    0.15
  ) !important;
  color: var(--sys-color-on-primary-container) !important;
  border: 1px solid transparent !important;
  transition: all var(--sys-motion-duration-200) ease;
}
.card.selected :deep(.badge:not(.role)) {
  background: rgba(
    var(--sys-color-on-primary-container-rgb),
    0.1
  ) !important;
  color: var(--sys-color-on-primary-container) !important;
  border: none;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sys-space-12);
}
.identity-group {
  display: flex;
  align-items: center;
  gap: var(--sys-space-14);
  flex: 1;
  min-width: 0;
}
.meta-stack {
  display: flex;
  flex-direction: column;
  gap: var(--sys-space-4);
  width: 60px;
  flex-shrink: 0;
}
.name-block {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: var(--sys-space-4);
}

.expand-btn {
  background: none;
  border: none;
  padding: var(--sys-space-8);
  color: var(--sys-color-outline);
  cursor: pointer;
  transition: transform var(--sys-motion-duration-300) var(--sys-motion-easing-standard);
}
.expand-btn.is-active {
  transform: rotate(180deg);
  color: var(--sys-color-primary);
}

.stat-pod {
  position: relative;
  width: var(--sys-space-48);
  height: var(--sys-space-48);
  background-image: radial-gradient(
    circle at 20% 20%,
    rgba(255, 255, 255, 0.05) 0%,
    transparent 60%
  );
  border-radius: var(--sys-shape-corner-input);
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    transform var(--sys-motion-duration-200) var(--sys-motion-easing-spring-overshoot),
    background-color var(--sys-motion-duration-300) ease;
  contain: layout;
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.05);
}
.stat-pod:hover {
  transform: scale(1.1);
  z-index: 10;
}

/* Default (no score): plain neutral fill. Written as :not(.score-tint)
   rather than a plain .stat-pod rule so it never competes on specificity
   with the global .score-tint fill below — Vue's scoped-style attribute
   selector would otherwise outrank a same-specificity global class
   regardless of source order. */
.stat-pod:not(.score-tint) {
  background: var(--sys-color-surface-container-highest);
}

/* [UI] UNIFORM COHERENCE (Semantic Contrast) */
.stat-pod :deep(.stat-score) {
  color: var(--sys-color-on-surface) !important;
  opacity: 0.95;
  /* Clean elevation without sticker-effect */
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

/* Tinted stat-pods fade the fill toward vivid primary as the score rises
   (see .score-tint in components.ts). Text switches - doesn't fade - from
   onSurface to onPrimary at --score-text-switch, the contrast-optimal
   crossover point; see the .score-tint.badge comment in components.ts for
   why a linear crossfade of ink is wrong here. Scoped to :not(.selected) so
   it can never out-specificity the selected card's own
   on-primary-container text override above. */
.card:not(.selected) .stat-pod.score-tint :deep(.stat-score) {
  color: color-mix(
    in oklch,
    var(--sys-color-on-primary)
      clamp(0%, calc((var(--score-raw, 0) - var(--sys-color-score-text-switch, 50)) * 1000%), 100%),
    var(--sys-color-on-surface)
  ) !important;
  opacity: 1;
}

.card-body {
  margin-top: var(--sys-space-16);
  padding-top: var(--sys-space-16);
  border-top: 1px solid rgba(0, 0, 0, 0.05);
  animation: fade-in var(--sys-motion-duration-300) ease;
}
@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(-5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Shared Hit Target Helper */
:deep(.hit-target) {
  position: relative;
  z-index: 5;
}
:deep(.hit-target)::after {
  content: "";
  position: absolute;
  inset: -4px;
}

</style>
