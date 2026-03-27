<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { ref, watch } from "vue";
import { useHaptics } from "@core";

const props = defineProps<{
  type: "success" | "warning" | "error" | "loading";
  text: string;
  nominal?: boolean;
  hubInfo?: {
    source: "WORKER" | "GAS";
    hubAge: string | null;
  };
}>();

const haptics = useHaptics();
const isExpanded = ref(false);

// Reset expansion when status changes significantly
watch(() => props.type, (newType) => {
  if (newType === "loading") isExpanded.value = true;
  else if (!props.nominal) isExpanded.value = false;
});

const handleToggle = () => {
  if (props.type === "loading") return;
  haptics.tap();
  isExpanded.value = !isExpanded.value;
};
</script>

<template>
  <div
    class="status-pill"
    :class="[props.type, { 'is-expanded': isExpanded, 'is-nominal': props.nominal }]"
    @click="handleToggle"
  >
    <div class="status-dot">
      <div class="dot-nucleus" :class="{ pulse: props.type !== 'success' }">
        <template v-if="props.type === 'loading'">
          <svg class="spinner" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" />
          </svg>
        </template>
      </div>
      <div v-if="props.type !== 'success' && props.type !== 'loading'" class="dot-halo"></div>
    </div>

    <Transition name="slide-fade">
      <div v-if="isExpanded || props.type === 'loading'" class="label-wrapper">
        <span class="status-label">
          {{ props.type === "loading" ? "Syncing..." : props.text }}
        </span>
        
        <div v-if="props.hubInfo && isExpanded" class="hub-meta">
          <span class="separator">/</span>
          <span class="hub-source" :class="props.hubInfo.source.toLowerCase()">
            <template v-if="props.hubInfo.source === 'WORKER'">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
              </svg>
            </template>
            {{ props.hubInfo.source }}
          </span>
          <span v-if="props.hubInfo.hubAge" class="hub-age">
            {{ props.hubInfo.hubAge }}
          </span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.status-pill {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 6px;
  background: var(--sys-surf-c);
  border: 1px solid var(--sys-border-subtle);
  border-radius: 100px;
  cursor: pointer;
  transition: all 0.4s var(--sys-motion-standard);
  user-select: none;
  overflow: hidden;
  max-width: 32px;
  white-space: nowrap;
}

.status-pill.is-expanded,
.status-pill.loading {
  max-width: 300px;
  padding: 0 12px 0 6px;
  background: var(--sys-surf-primary);
  border-color: var(--sys-border-prominent);
}

/* Logic for nominal mode - only expand on click or loading */
.status-pill.is-nominal:not(.is-expanded):not(.loading) {
  width: 32px;
  padding: 0;
  justify-content: center;
}

.status-dot {
  position: relative;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.dot-nucleus {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  z-index: 2;
}

.dot-halo {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.15;
  z-index: 1;
}

/* Pulsing animations */
.pulse {
  animation: pulse-core 2s infinite ease-in-out;
}

@keyframes pulse-core {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.3); opacity: 0.7; }
}

/* Status Colors */
.success { color: var(--sys-success); }
.warning { color: var(--sys-warning); }
.error   { color: var(--sys-error); }
.loading { color: var(--sys-primary); }

.label-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 6px;
}

.status-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--sys-text-primary);
}

.hub-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--sys-font-mono);
  font-size: 10px;
  color: var(--sys-text-tertiary);
}

.hub-source {
  display: flex;
  align-items: center;
  gap: 3px;
  font-weight: 800;
  padding: 1px 4px;
  border-radius: 4px;
}

.hub-source.worker {
  background: var(--sys-primary-muted);
  color: var(--sys-primary);
}

.hub-source.gas {
  background: var(--sys-surf-h);
  color: var(--sys-text-secondary);
}

.spinner {
  width: 14px;
  height: 14px;
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.spinner circle {
  stroke-dasharray: 45;
  stroke-dashoffset: 0;
  transform-origin: center;
  stroke: currentColor;
}

/* Transitions */
.slide-fade-enter-active {
  transition: all 0.3s ease-out;
}
.slide-fade-leave-active {
  transition: all 0.2s cubic-bezier(1, 0.5, 0.8, 1);
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateX(-10px);
  opacity: 0;
}
</style>
