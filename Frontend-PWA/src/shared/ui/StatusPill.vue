<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { ref, watch } from "vue";
import { useHaptics } from "@core";

const props = withDefaults(defineProps<{
  type: "success" | "warning" | "error" | "loading";
  text: string;
  nominal?: boolean;
  direction?: "left" | "right";
  hubInfo?: {
    source: "WORKER" | "GAS";
    hubAge: string | null;
  };
}>(), {
  direction: "right"
});

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
        :class="{ pulse: props.type !== 'success', 'is-syncing': props.type === 'loading' }"
      >
        <template v-if="props.type === 'loading'">
          <svg class="spinner" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" />
          </svg>
        </template>
      </div>
      <div v-if="props.type !== 'loading'" class="dot-halo"></div>
    </div>

    <Transition :name="props.direction === 'left' ? 'slide-fade-left' : 'slide-fade'">
      <div v-if="isExpanded || props.type === 'loading'" class="label-wrapper">
        <template v-if="props.type === 'loading'">
          <span class="status-label">Syncing...</span>
        </template>
        <template v-else-if="props.hubInfo && isExpanded">
          <div class="hub-meta">
            <span class="hub-source" :class="props.hubInfo.source.toLowerCase()">
              <template v-if="props.hubInfo.source === 'WORKER'">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                </svg>
              </template>
              {{ props.hubInfo.source }}
            </span>
            <span v-if="props.hubInfo.hubAge" class="separator">|</span>
            <span v-if="props.hubInfo.hubAge" class="hub-age">
              {{ props.hubInfo.hubAge }}
            </span>
          </div>
        </template>
        <template v-else>
          <span v-if="props.text" class="status-label">{{ props.text }}</span>
        </template>
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
  border: 1px solid rgba(128, 128, 128, 0.15);
  border-radius: 100px;
  cursor: pointer;
  transition: all 0.4s var(--sys-motion-standard);
  user-select: none;
  overflow: hidden;
  max-width: 32px;
  white-space: nowrap;
}

.status-pill.expand-left {
  flex-direction: row-reverse;
}

.status-pill.is-expanded,
.status-pill.loading {
  max-width: 300px;
  background: var(--sys-surf-primary);
  border-color: rgba(128, 128, 128, 0.3);
}

.status-pill.expand-right.is-expanded,
.status-pill.expand-right.loading {
  padding: 0 12px 0 6px;
}

.status-pill.expand-left.is-expanded,
.status-pill.expand-left.loading {
  padding: 0 6px 0 12px;
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
  box-shadow: 0 0 8px currentColor;
  transition: all 0.3s ease;
}

.dot-nucleus.is-syncing {
  width: 14px;
  height: 14px;
  background: none;
  box-shadow: none;
}

.dot-halo {
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.12;
  z-index: 1;
  transform: scale(0.8);
  animation: halo-breathing 4s infinite ease-in-out;
}

@keyframes halo-breathing {
  0%, 100% { transform: scale(0.8); opacity: 0.12; }
  50% { transform: scale(1.2); opacity: 0.05; }
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
}

.expand-right .label-wrapper {
  margin-left: 6px;
}

.expand-left .label-wrapper {
  margin-right: 6px;
}

.status-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--sys-text-primary);
}

.hub-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: var(--sys-font-mono);
  font-size: 10px;
  color: var(--sys-text-tertiary);
}

.separator {
  opacity: 0.3;
  font-weight: 300;
  margin: 0 2px;
}

.hub-age {
  font-weight: 500;
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
.slide-fade-enter-active,
.slide-fade-left-enter-active {
  transition: all 0.3s ease-out;
}
.slide-fade-leave-active,
.slide-fade-left-leave-active {
  transition: all 0.2s cubic-bezier(1, 0.5, 0.8, 1);
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateX(-10px);
  opacity: 0;
}

.slide-fade-left-enter-from,
.slide-fade-left-leave-to {
  transform: translateX(10px);
  opacity: 0;
}

</style>
