<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { useHaptics } from "@core";
import { onMounted, onBeforeUnmount } from "vue";

/**
 * STATUS PILL / CONNECTIVITY HUB (Layer 2 - Shared UI)
 * ----------------------------------------------------------------------------
 * Rationale: Provides a "Command Center" view of application connectivity.
 * Features: Smooth grid-based expansion, horizontal alignment, zero-overlap.
 * ----------------------------------------------------------------------------
 */

const props = withDefaults(defineProps<{
  type: "success" | "warning" | "error" | "loading";
  text: string;
  nominal?: boolean;
  direction?: "left" | "right";
  remoteInfo?: {
    source: string;
    dataAge: string | null;
    diagnosis?: string | null;
    lastCompiled?: string | null;
  };
}>(), {
  direction: "right"
});

const emit = defineEmits<{
  refresh: [];
}>();

const haptics = useHaptics();
const isExpanded = ref(false);
const isRefreshingLocally = ref(false);

// Auto-expand on errors or loading to catch user attention
watch(() => props.type, (newType) => {
  if (newType === "loading") {
    isExpanded.value = true;
    isRefreshingLocally.value = true;
  } else {
    isRefreshingLocally.value = false;
    if (newType === "error") isExpanded.value = true;
  }
});

const handleToggle = (e: Event) => {
  // Prevent toggle if clicking the internal sync button
  if ((e.target as HTMLElement).closest('.sync-action')) return;
  
  if (props.type === "loading") return;
  haptics.tap();
  isExpanded.value = !isExpanded.value;
};

const handleRefresh = () => {
  if (props.type === 'loading') return;
  haptics.impact('light');
  emit('refresh');
};

const isDB = computed(() => props.text === 'DB');

// Responsive label truncation: on very narrow screens, show only the last word (e.g., "Operational")
const displayText = computed(() => {
  // Use window.innerWidth for simple responsive check; fallback to full text on larger screens.
  if (typeof window !== 'undefined' && window.innerWidth < 360) {
    const parts = props.text.split(' ');
    return parts.length > 1 ? parts[parts.length - 1] : props.text;
  }
  return props.text;
});

const displaySource = computed(() => {
  if (!props.remoteInfo?.source) return null;
  // If the status is 'DB', showing 'SUPABASE' is redundant
  if (isDB.value && props.remoteInfo.source === 'SUPABASE') return null;
  return props.remoteInfo.source === 'SUPABASE' ? 'DB' : props.remoteInfo.source;
});
</script>

<template>
  <div
    class="status-pill"
    :class="[
      props.type, 
      `expand-${props.direction}`,
      { 'is-expanded': isExpanded, 'is-nominal': props.nominal }
    ]"
    @click="handleToggle"
  >
    <div class="status-dot">
      <div 
        class="dot-nucleus" 
        :class="{ 
          'breath': props.type === 'success' && !isExpanded, 
          'pulse': props.type !== 'success',
          'is-syncing': props.type === 'loading' 
        }"
      >
        <template v-if="props.type === 'loading'">
          <svg class="spinner" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" />
          </svg>
        </template>
      </div>
      <div v-if="props.type !== 'loading'" class="dot-halo"></div>
    </div>

    <div class="pill-content-wrapper">
      <div class="pill-content">
        <!-- BASE LABEL -->
        <span v-if="props.type === 'loading'" class="status-label technical base-label">Syncing...</span>
        <span v-else class="status-label technical base-label" :class="{ 'is-db': isDB }">
          <template v-if="isDB">
            <svg class="icon-bolt" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
          </template>
          {{ displayText }}
        </span>

        <!-- EXPANDED CONTENT (Grid Transition) -->
        <div class="expanded-section" :class="{ 'is-open': isExpanded && props.type !== 'loading' }">
          <div class="expanded-inner">
            <div class="divider"></div>
            
            <div v-if="displaySource || props.remoteInfo?.dataAge || props.remoteInfo?.diagnosis" class="hub-details">
              <span v-if="displaySource" class="source-tag technical" :class="(props.remoteInfo?.source || '').toLowerCase()">
                {{ displaySource }}
              </span>
              <span v-if="props.remoteInfo?.diagnosis" class="diagnosis-info technical">
                {{ props.remoteInfo.diagnosis }}
              </span>
              <span v-else-if="props.remoteInfo?.dataAge" class="age-info technical">
                {{ props.remoteInfo.dataAge }}
              </span>
            </div>

            <button 
              class="sync-action" 
              :disabled="props.type === 'loading'"
              title="Force Sync"
              @click.stop="handleRefresh"
            >
              <svg :class="{ 'is-spinning': props.type === 'loading' }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 4px;
  border-radius: 14px;
  background: var(--sys-surface-container);
  border: 1px solid var(--sys-outline);
  cursor: pointer;
  transition: all 0.5s var(--sys-motion-spring, cubic-bezier(0.175, 0.885, 0.32, 1.275));
  user-select: none;
  position: relative;
  z-index: 50;
  box-shadow: 0 2px 8px rgba(0,0,0,0);
  max-width: 100%;
  flex-shrink: 0;
}

/* Ensure label text truncates when space is limited */
.pill-content .status-label {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-pill.is-nominal {
  border-color: transparent;
  background: transparent;
}

.status-pill.is-expanded {
  background: var(--sys-surface-glass);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-color: var(--sys-outline-variant);
  box-shadow: var(--sys-elevation-level2);
}

.status-pill.expand-left {
  flex-direction: row-reverse;
}

/* Ensure symmetric padding so width animation is flawless */
.status-pill.is-expanded.expand-right {
  padding-right: 6px;
}
.status-pill.is-expanded.expand-left {
  padding-left: 6px;
}

/* Color Tones */
.status-pill.success { color: var(--sys-success); }
.status-pill.warning { color: var(--sys-warning); border-color: var(--sys-warning); }
.status-pill.error   { color: var(--sys-error); border-color: var(--sys-error); }
.status-pill.loading { border-color: var(--sys-primary); color: var(--sys-primary); }

.status-dot {
  position: relative;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.dot-nucleus {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  z-index: 2;
  transition: all 0.3s cubic-bezier(0.25, 1, 0.3, 1);
}

.status-pill.loading .dot-nucleus {
  background: transparent;
}

.dot-nucleus.breath {
  animation: breath 4s ease-in-out infinite;
}

.dot-nucleus.pulse {
  animation: pulse 2s infinite;
}

.dot-halo {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.12;
  animation: halo-pulse 2.5s infinite;
}

.pill-content-wrapper {
  display: flex;
  align-items: center;
  margin-left: 2px;
  margin-right: 4px;
}

.status-pill.expand-left .pill-content-wrapper {
  margin-left: 4px;
  margin-right: 2px;
  flex-direction: row-reverse;
}

.pill-content {
  display: flex;
  align-items: center;
  gap: 0;
  white-space: nowrap;
}

.status-pill.expand-left .pill-content {
  flex-direction: row-reverse;
}

.technical {
  font-family: var(--sys-font-mono);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  line-height: 1;
}

.base-label {
  display: flex;
  align-items: center;
  gap: 4px;
  transition: opacity 0.3s ease;
}

.status-label.is-db {
  color: var(--sys-primary);
}

.icon-bolt {
  animation: bolt-flicker 3s infinite;
}

/* EXPANDED SECTION GRID TRANSITION */
.expanded-section {
  display: grid;
  grid-template-columns: 0fr;
  opacity: 0;
  transition: grid-template-columns 0.5s var(--sys-motion-spring, cubic-bezier(0.175, 0.885, 0.32, 1.275)), 
              opacity 0.4s ease;
}

.expanded-section.is-open {
  grid-template-columns: 1fr;
  opacity: 1;
}

.expanded-inner {
  overflow: hidden;
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-pill.expand-left .expanded-inner {
  flex-direction: row-reverse;
}

.divider {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--sys-outline-variant);
  margin: 0 4px;
  flex-shrink: 0;
}

.hub-details {
  display: flex;
  align-items: center;
  gap: 6px;
}

.source-tag {
  display: flex;
  align-items: center;
  padding: 2px 5px;
  border-radius: 5px;
  background: var(--sys-surface-container-highest);
  color: var(--sys-text-secondary);
  font-size: 8px;
  font-weight: 900;
}

.source-tag.supabase {
  color: var(--sys-primary);
  background: var(--sys-primary-container);
}

.age-info,
.diagnosis-info {
  color: var(--sys-text-tertiary);
  font-size: 9px;
}

.diagnosis-info {
  color: var(--sys-warning);
}

.status-pill.error .diagnosis-info {
  color: var(--sys-error);
}

.sync-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  background: var(--sys-surface-container-high);
  color: var(--sys-primary);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.25, 1, 0.3, 1);
  flex-shrink: 0;
}

.sync-action:hover {
  background: var(--sys-primary);
  color: var(--sys-on-primary);
  transform: scale(1.1) rotate(15deg);
}

.sync-action:active {
  transform: scale(0.9) rotate(-15deg);
}

.sync-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.spinner {
  width: 14px;
  height: 14px;
  animation: rotate 1.5s linear infinite;
}

.is-spinning {
  animation: rotate 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@keyframes bolt-flicker {
  0%, 100% { opacity: 1; filter: drop-shadow(0 0 2px var(--sys-primary)); }
  50% { opacity: 0.7; filter: drop-shadow(0 0 0px transparent); }
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes breath {
  0%, 100% { transform: scale(1); opacity: 0.7; }
  50% { transform: scale(1.2); opacity: 1; }
}

@keyframes pulse {
  0% { transform: scale(1); box-shadow: 0 0 0 0 currentColor; }
  70% { transform: scale(1.1); box-shadow: 0 0 0 6px transparent; }
  100% { transform: scale(1); box-shadow: 0 0 0 0 transparent; }
}

@keyframes halo-pulse {
  0% { transform: scale(0.6); opacity: 0.4; }
  100% { transform: scale(2.8); opacity: 0; }
}
</style>
