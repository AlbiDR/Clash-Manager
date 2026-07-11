<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { ref, watch } from "vue";
import { Icon } from "@shared";
import { normalizeTag } from "@core";
import { useHaptics } from "@shared";

const props = defineProps<{
  modelValue: string | null;
  playerName?: string;
  isFetching?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [string | null];
  lockIn: [string | null];
}>();

const haptics = useHaptics();
const localTag = ref(props.modelValue || "");

watch(() => props.modelValue, (newVal) => {
  localTag.value = newVal || "";
});

function handleLockIn() {
  const tag = localTag.value.trim();
  haptics.tap();
  if (tag) {
    emit("lockIn", normalizeTag(tag));
  } else {
    emit("lockIn", null);
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
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
  height: 40px;
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
  width: 32px;
  height: 32px;
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
  height: 40px;
  background: var(--sys-color-surface-container);
  border-radius: var(--sys-shape-corner-medium);
  border: 1px solid rgba(128, 128, 128, 0.1);
  white-space: nowrap;
  max-width: 120px;
  overflow: hidden;
}

.label-text {
  font-size: var(--sys-typescale-meta);
  font-weight: 800;
  color: var(--sys-color-primary);
  text-transform: uppercase;
  overflow: hidden;
  text-overflow: ellipsis;
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
