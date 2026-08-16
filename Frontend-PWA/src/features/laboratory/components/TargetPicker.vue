<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->

<script setup lang="ts">
/**
 * COMPONENT: TargetPicker.vue
 * ----------------------------------------------------------------------------
 * Rationale: Standardized player tag input and lock-in component for Laboratory (Layer 3).
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * Orchestrates player tag search/isolation for the Laboratory progression features.
 * It manages real-time user tag input buffers, sanitizes inputs, and normalizes
 * targets via `@core` validation boundaries before dispatching lock-in events.
 *
 * **Design Contracts & Constraints:**
 * - Satisfies ADR Section III (Validation Boundaries) by enforcing canonical tag formats.
 * - Adheres to ADR Section II (Unified Layout / Mobile Footprint): maintains a rigid 48px footprint height.
 */

import { ref, watch } from "vue";
import { Icon, vTactile } from "@shared";
import { normalizeTag } from "@core";

const props = defineProps<{
  /** The current normalized player tag bound via v-model. */
  modelValue: string | null;
  /** Optional descriptive name of the currently resolved target player. */
  playerName?: string;
  /** Reactive state indicating if an authoritative profile fetch/sync is active. */
  isFetching?: boolean;
}>();

const emit = defineEmits<{
  /** Emitted to update the modelValue binding on input. */
  "update:modelValue": [string | null];
  /** Emitted when the target player tag is confirmed/locked in. */
  lockIn: [string | null];
}>();

/**
 * Local input buffer holding the raw or partially-entered player tag.
 * Synchronized with props.modelValue to support resets and remote updates.
 */
const localTag = ref(props.modelValue || "");

watch(() => props.modelValue, (newModelValue) => {
  localTag.value = newModelValue || "";
});

/**
 * Sanitizes input, resolves the canonical tag shape via core utilities, and
 * dispatches the lock-in event to initiate upstream data synchronization.
 *
 * [DECISION LOG] Tag Normalization: Normalizing tags early prevents duplication,
 * cache lookup failures, and downstream database constraint violations.
 */
function handleLockIn() {
  const trimmedPlayerTag = localTag.value.trim();
  if (trimmedPlayerTag) {
    // [GUARD] normalizes inputs to strip hashtags or sanitize leading/trailing spaces.
    emit("lockIn", normalizeTag(trimmedPlayerTag));
  } else {
    emit("lockIn", null);
  }
}

/**
 * Listens for keyboard actions to trigger native confirm/lock-in on pressing Enter.
 */
function handleKeydown(keyboardEvent: KeyboardEvent) {
  if (keyboardEvent.key === 'Enter') {
    handleLockIn();
  }
}
</script>

<template>
  <div class="target-picker">
    <div class="input-box" :class="{ 'is-fetching': props.isFetching }">
      <Icon name="crosshair" size="16" class="prefix-icon" />
      <input
        v-model="localTag"
        type="text"
        class="tag-input"
        placeholder="PLAYER TAG..."
        spellcheck="false"
        autocomplete="off"
        @keydown="handleKeydown"
      />
      
      <button 
        class="lock-btn" 
        :disabled="props.isFetching"
        @click="handleLockIn"
        v-tactile
      >
        <Icon :name="props.isFetching ? 'loader' : 'check'" :size="16" />
      </button>
    </div>
    
    <div v-if="props.playerName" class="player-label">
      <span class="label-text">{{ props.playerName }}</span>
    </div>
  </div>
</template>

<style scoped>
.target-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 140px;
}

.input-box {
  position: relative;
  height: 48px; /* 48px Mobile Footprint (Target B.2) */
  background: var(--sys-color-surface-container-high);
  border-radius: var(--sys-shape-corner-input);
  display: flex;
  align-items: center;
  padding: 0 var(--sys-space-4) 0 var(--sys-space-12);
  gap: var(--sys-space-8);
  border: 1px solid rgba(128, 128, 128, 0.15);
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.02);
  transition: all var(--sys-motion-duration-200) ease;
  flex: 1;
}

.input-box:focus-within {
  border-color: rgba(var(--sys-color-primary-rgb), 0.3);
}

.prefix-icon {
  color: var(--sys-color-on-surface-variant);
  flex-shrink: 0;
}

.tag-input {
  flex: 1;
  background: none;
  border: none;
  color: var(--sys-color-on-surface);
  font-size: var(--sys-typescale-body-sm);
  font-weight: 700;
  font-family: var(--sys-font-family-mono);
  outline: none;
  width: 0; /* Allow flex to shrink */
  text-transform: uppercase;
}

.tag-input::placeholder {
  color: var(--sys-color-on-surface-variant);
  font-weight: 500;
  opacity: 0.5;
}

.lock-btn {
  width: 40px;
  height: 40px;
  border-radius: var(--sys-shape-corner-stat);
  background: var(--sys-color-primary);
  border: none;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all var(--sys-motion-duration-200) var(--sys-motion-spring);
  flex-shrink: 0;
}

.lock-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(var(--sys-color-primary-rgb), 0.3);
}

.lock-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.lock-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.player-label {
  display: flex;
  align-items: center;
  padding: 0 var(--sys-space-10);
  height: 48px;
  background: var(--sys-color-surface-container);
  border-radius: var(--sys-shape-corner-medium);
  border: 1px solid rgba(128, 128, 128, 0.1);
  white-space: nowrap;
  max-width: 120px;
  overflow: hidden;
  user-select: none; /* Text Selection Containment (Target A.3) */
  -webkit-user-select: none;
}

.label-text {
  font-size: var(--sys-typescale-meta);
  font-weight: 800;
  color: var(--sys-color-primary);
  text-transform: uppercase;
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: none; /* Text Selection Containment (Target A.3) */
  -webkit-user-select: none;
}

.is-fetching .lock-btn {
  background: var(--sys-color-surface-container);
  color: var(--sys-color-on-surface-variant);
}

.is-fetching .lock-btn :deep(svg) {
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Responsive adjustment - disabled to ensure visibility in screenshots */
/* @media (max-width: 480px) {
  .player-label {
    display: none;
  }
} */
</style>
