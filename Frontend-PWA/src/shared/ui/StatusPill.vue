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
    source: "SUPABASE" | "WORKER" | "GAS";
    hubAge: string | null;
    diagnosis?: "TIMEOUT" | "AUTH" | "VALIDATION" | "OFFLINE" | "SUCCESS" | null;
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
                HUB
              </template>
              <template v-else-if="props.hubInfo.source === 'SUPABASE'">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke">
                  <path d="M4 6c0 1.66 3.58 3 8 3s8-1.34 8-3-3.58-3-8-3-8 1.34-8 3zm16 5c0 1.66-3.58 3-8 3s-8-1.34-8-3V8.67C5.33 9.47 8 10 12 10s6.67-.53 8-1.33V11zm0 5c0 1.66-3.58 3-8 3s-8-1.34-8-3v-2.33c1.33.8 4 1.33 8 1.33s6.67-.53 8-1.33V16z"/>
                </svg>
                DB
              </template>
              <template v-else>
                GAS
              </template>
            </span>
            <span v-if="props.hubInfo.hubAge" class="separator">|</span>
            <span v-if="props.hubInfo.hubAge" class="hub-age">
              {{ props.hubInfo.hubAge }}
            </span>
            <span v-if="props.hubInfo.source !== 'WORKER' && props.hubInfo.diagnosis" class="diagnosis-tag">
              ({{ props.hubInfo.diagnosis }})
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
  padding: 0 4px;
  border-radius: 16px;
  background: var(--sys-surf-c);
  border: 1px solid var(--sys-outline-v);
  overflow: hidden;
  cursor: pointer;
  transition: all 0.4s var(--sys-motion-standard);
  user-select: none;
  position: relative;
  z-index: 10;
}

.status-pill.is-nominal {
  border-color: transparent;
  background: transparent;
}

.status-pill.is-expanded {
  padding: 0 10px 0 4px;
  background: var(--sys-surf-l);
  box-shadow: var(--sys-elev-1);
}

.status-pill.expand-left.is-expanded {
  flex-direction: row-reverse;
  padding: 0 4px 0 10px;
}

/* Base Types */
.status-pill.loading { border-color: var(--sys-primary); background: var(--sys-primary-container); }
.status-pill.success { color: var(--sys-success); }
.status-pill.warning { color: var(--sys-warning); border-color: var(--sys-warning); }
.status-pill.error   { color: var(--sys-error); border-color: var(--sys-error); }

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
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  z-index: 2;
  transition: all 0.3s ease;
}

.status-pill.loading .dot-nucleus {
  background: transparent;
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
  opacity: 0.15;
  animation: halo-pulse 2s infinite;
}

.label-wrapper {
  display: flex;
  align-items: center;
  white-space: nowrap;
  margin-left: 6px;
  overflow: hidden;
}

.status-pill.expand-left .label-wrapper {
  margin-left: 0;
  margin-right: 6px;
}

.status-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.hub-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  font-family: var(--sys-font-mono);
}

.hub-source {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 4px;
  border-radius: 4px;
  background: var(--sys-surf-c);
}

.hub-source.worker {
  color: var(--sys-primary);
  background: var(--sys-primary-container);
}

.hub-source.supabase {
  color: var(--sys-primary);
  background: var(--sys-primary-container);
}

.hub-source.gas {
  color: var(--sys-warning);
  background: var(--sys-warning-container);
}

.hub-age {
  color: var(--sys-text-secondary);
}

.separator {
  color: var(--sys-outline);
  opacity: 0.5;
}

.diagnosis-tag {
  color: var(--sys-error);
  font-size: 9px;
  font-weight: 800;
}

.spinner {
  width: 16px;
  height: 16px;
  animation: rotate 2s linear infinite;
  color: var(--sys-primary);
}

@keyframes rotate {
  100% { transform: rotate(360deg); }
}

@keyframes pulse {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.2); opacity: 0.8; }
  100% { transform: scale(1); opacity: 1; }
}

@keyframes halo-pulse {
  0% { transform: scale(0.8); opacity: 0.3; }
  100% { transform: scale(2.2); opacity: 0; }
}

/* Transitions */
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.3s var(--sys-motion-standard);
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateX(-10px);
  opacity: 0;
}

.slide-fade-left-enter-active,
.slide-fade-left-leave-active {
  transition: all 0.3s var(--sys-motion-standard);
}
.slide-fade-left-enter-from,
.slide-fade-left-leave-to {
  transform: translateX(10px);
  opacity: 0;
}
</style>
