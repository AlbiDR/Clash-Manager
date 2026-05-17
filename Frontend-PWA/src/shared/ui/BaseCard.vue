<script setup lang="ts">
import Icon from "./Icon.vue";
import { useCardMechanics } from "../composables/useCardMechanics";

const props = defineProps<{
  id: string;
  expanded: boolean;
  selected: boolean;
  selectionMode: boolean;
  isTagged?: boolean;
  score?: number;
}>();

const emit = defineEmits<{
  toggle: [];
  "toggle-select": [];
  "score-click": [Event];
}>();

// Reusable card mechanics
const {
  handleTap,
  handleLongPress,
  handleScoreClick: internalScoreClick,
  handleExpandClick: internalExpandClick,
} = useCardMechanics(props, {
  onExpand: () => emit("toggle"),
  onSelect: () => emit("toggle-select"),
});

function handleScoreClick(scoreClickEvent: MouseEvent | TouchEvent) {
  internalScoreClick(scoreClickEvent);
  emit("score-click", scoreClickEvent as Event);
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
            :style="props.score !== undefined ? { '--score-pct': `${props.score}%` } : {}"
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
  border-radius: 20px;
  padding: 12px 16px;
  margin-bottom: 8px;
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
    transform 0.2s var(--sys-motion-spring),
    background-color 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.25s ease,
    margin 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 0 0 rgba(0, 0, 0, 0);

  /* [PERF] PERFORMANCE: Removed 'paint' containment to allow shadow/scale bleed */
  contain: layout style;
  content-visibility: auto;
}

.card.expanded {
  background: var(--sys-color-surface-container-high);
  box-shadow: var(--sys-elevation-3);
  margin-top: 16px;
  margin-bottom: 16px;
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
    var(--sys-color-on-primary-container-rgb, 0, 29, 54),
    0.15
  ) !important;
  color: var(--sys-color-on-primary-container) !important;
  border: 1px solid transparent !important;
  transition: all 0.2s ease;
}
.card.selected :deep(.badge:not(.role)) {
  background: rgba(
    var(--sys-color-on-primary-container-rgb, 0, 29, 54),
    0.1
  ) !important;
  color: var(--sys-color-on-primary-container) !important;
  border: none;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.identity-group {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 1;
  min-width: 0;
}
.meta-stack {
  display: flex;
  flex-direction: column;
  gap: 4px;
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
  gap: 4px;
}

.expand-btn {
  background: none;
  border: none;
  padding: 8px;
  color: var(--sys-color-outline);
  cursor: pointer;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.expand-btn.is-active {
  transform: rotate(180deg);
  color: var(--sys-color-primary);
}

.stat-pod {
  position: relative;
  width: 48px;
  height: 48px;
  /* [LOGIC] SEMANTIC CONTAINER SCALING:
     Using primary-container ensures mathematical contrast 
     coherence across themes:
     - Dark Mode: Surface -> Deep Blue (Light text remains legible)
     - Light Mode: Surface -> Pale Blue (Dark text remains legible) */
  background: color-mix(
    in srgb,
    var(--sys-color-primary-container) var(--score-pct, 0%),
    var(--sys-color-surface-container-highest)
  );
  background-image: radial-gradient(
    circle at 20% 20%,
    rgba(255, 255, 255, 0.05) 0%,
    transparent 60%
  );
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
    background-color 0.3s ease;
  contain: layout;
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.05);
}
.stat-pod:hover {
  transform: scale(1.1);
  z-index: 10;
}

/* [UI] UNIFORM COHERENCE (Semantic Contrast) */
.stat-pod :deep(.stat-score) {
  color: var(--sys-color-on-surface) !important;
  opacity: 0.95;
  /* Clean elevation without sticker-effect */
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.card-body {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
  animation: fade-in 0.3s ease;
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
