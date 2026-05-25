<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
/**
 * [GUARD] ERROR STATE
 * Resilience #45: Handles non-standard error displays with a premium, manifesto-compliant UI.
 */
import { ref } from "vue";
import Icon from "./Icon.vue";

const props = defineProps<{
  message: string;
}>();

defineEmits<{
  retry: [];
}>();

const isActive = ref(false);
</script>

<template>
  <div class="error-state animate-pulse-glow" @mousedown="isActive = true" @mouseup="isActive = false">
    <div class="error-icon-box">
      <!-- Custom Crafted Warning SVG -->
      <Icon name="warning" size="48" class="svg-warning" />
      <svg width="0" height="0" style="position: absolute;">
        <defs>
          <linearGradient id="warning-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color: var(--sys-color-error); stop-opacity: 1" />
            <stop offset="100%" style="stop-color: #ff8e8e; stop-opacity: 1" />
          </linearGradient>
        </defs>
      </svg>
    </div>
    
    <p class="error-message">{{ message }}</p>
    
    <button 
      class="btn-error" 
      :class="{ active: isActive }"
      @click="$emit('retry')"
    >
      <Icon name="refresh" size="18" class="svg-refresh" />
      <span>Re-Synchronize</span>
    </button>
  </div>
</template>

<style scoped>
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  padding: 3rem 2rem;
  text-align: center;
  background: var(--sys-surface-glass);

  color: var(--sys-color-on-error-container);
  border-radius: 32px;
  border: 1px solid var(--sys-surface-glass-border);
  box-shadow: var(--sys-shadow-xl);
  margin: 20px 0;
}

.error-icon-box {
  color: var(--sys-color-error);
  padding: 16px;
  background: rgba(var(--sys-color-error-rgb, 255, 68, 68), 0.1);
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: rotate(-2deg);
}

.svg-warning {
  opacity: 0.9;
}

.svg-warning :deep(.icon-path) {
  fill: url(#warning-grad);
}

.error-message {
  font-weight: 750;
  font-size: 16px;
  margin: 0;
  max-width: 320px;
  line-height: 1.5;
  letter-spacing: -0.01em;
  color: var(--sys-color-on-surface);
}

.btn-error {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 24px;
  background: var(--sys-color-error);
  color: white;
  border: none;
  border-radius: 99px;
  font-weight: 850;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s var(--sys-motion-spring);
  box-shadow: 0 8px 16px rgba(var(--sys-color-error-rgb, 255, 68, 68), 0.3);
}

.btn-error:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 20px rgba(var(--sys-color-error-rgb, 255, 68, 68), 0.4);
}

.btn-error.active {
  transform: scale(0.96);
  opacity: 0.9;
}

.svg-refresh {
  transition: transform 0.6s var(--sys-motion-spring);
}

.btn-error:hover .svg-refresh {
  transform: rotate(180deg);
}
</style>
