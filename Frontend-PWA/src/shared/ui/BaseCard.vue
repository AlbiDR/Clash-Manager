<script setup lang="ts">
import Icon from "./Icon.vue";
import { useCardMechanics } from "../composables/useCardMechanics";
import { computed } from "vue";
const props = defineProps<{
  id: string;
  expanded: boolean;
  selected: boolean;
  selectionMode?: boolean;
  isTagged?: boolean;
  // Optional tonal class for the score pod (e.g. 'tone-high', 'tone-mid')
  toneClass?: string;
  // For accessibility
  headerLabel?: string;
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

function handleScoreClick(e: Event) {
  internalScoreClick(e);
  emit("score-click", e);
}
</script>

<template>
  <div
    class="card squish-interaction"
    :class="{ expanded: expanded, selected: selected, tagged: isTagged }"
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
          <div class="stat-pod hit-target" :class="toneClass">
            <slot name="score-section"></slot>
          </div>
        </div>

        <!-- Expand Button -->
        <button
          class="expand-btn hit-target"
          @click.stop="internalExpandClick"
          :class="{ 'is-active': expanded }"
          aria-label="Expand details"
        >
          <Icon name="chevron_down" size="20" />
        </button>
      </div>
    </div>

    <!-- Expanded Content -->
    <div class="card-body" v-if="expanded">
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
  /* ⚡ OPTIMIZED: Removed 'all', strictly animates composited properties + colors */
  transition:
    transform 0.2s var(--sys-motion-spring),
    background-color 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.25s ease,
    margin 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 0 0 rgba(0, 0, 0, 0);
  will-change: transform, box-shadow, margin;

  /* ⚡ PERFORMANCE: Removed 'paint' containment to allow shadow/scale bleed */
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
    0.12
  ) !important;
  color: var(--sys-color-on-primary-container) !important;
  border: 1px solid rgba(var(--sys-color-on-primary-container-rgb), 0.1);
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
  background: var(--sys-color-surface-container-highest);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 900;
  font-family: var(--sys-font-family-mono);
  transition: transform 0.2s;
}
.stat-pod:hover {
  transform: scale(1.05);
}
.stat-pod.tone-high {
  background: var(--sys-color-primary);
  color: #FFFFFF; /* FORCE LIGHT TEXT */
}
.stat-pod.tone-mid {
  background: var(--sys-color-secondary-container);
  color: var(--sys-color-on-secondary-container);
}
:root.dark .stat-pod.tone-high {
  color: #000000; /* Revert to specific dark mode pref if needed, but user asked for coherence. Let's stick to white for high contrast on primary. */
  color: #FFFFFF;
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

/* ⚡ SHARED CARD STYLES (Deduplicated) */
:deep(.player-name) {
  font-size: 16px;
  font-weight: 850;
  color: var(--sys-color-on-surface);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -0.02em;
  line-height: 1.1;
}

:deep(.trophy-meta) {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #854d0e;
  margin-top: 2px;
  width: fit-content;
}
:root.dark :deep(.trophy-meta) {
  color: #fbbf24;
}

:deep(.trophy-val) {
  font-size: 13px;
  font-weight: 700;
  font-family: var(--sys-font-family-mono);
}

:deep(.badge) {
  height: 18px;
  width: 100%;
  background: var(--sys-color-surface-container-highest);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 800;
  color: var(--sys-color-on-surface);
  font-family: var(--sys-font-family-mono);
  text-transform: uppercase;
}

:deep(.stat-score) {
  font-size: 18px;
  font-weight: 900;
  font-family: var(--sys-font-family-mono);
}

:deep(.btn-action) {
  flex: 1;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--sys-color-surface-container-highest);
  color: var(--sys-color-on-surface);
  font-weight: 700;
  text-decoration: none;
  border: none;
  cursor: pointer;
  transition: transform 0.2s, background-color 0.2s;
}

:deep(.btn-action:active) {
  transform: scale(0.98);
}

:deep(.btn-action.primary) {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
}

:deep(.btn-action.compact) {
  font-size: 13px;
}
</style>
