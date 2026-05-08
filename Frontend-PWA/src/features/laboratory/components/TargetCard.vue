<script setup lang="ts">
import { ref, watch } from "vue";
import { Icon } from "@shared";

const props = defineProps<{
  modelValue: string | null;
  playerName?: string | null;
  isFetching: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string | null];
  "lockIn": [value: string];
}>();

const localTag = ref(props.modelValue || "");

watch(() => props.modelValue, (newVal) => {
  localTag.value = newVal || "";
});

function handleLockIn() {
  const tag = localTag.value.trim();
  if (tag) {
    const formattedTag = tag.startsWith('#') ? tag.toUpperCase() : `#${tag.toUpperCase()}`;
    emit("lockIn", formattedTag);
  } else {
    emit("lockIn", null as any);
  }
}
</script>

<template>
  <div class="target-card glass-panel" :class="{ 'is-loading': isFetching }">
    <div class="card-header">
      <Icon name="crosshair" size="14" />
      <span class="label">TARGET</span>
    </div>

    <div class="input-row">
      <div class="input-wrapper">
        <input
          v-model="localTag"
          type="text"
          placeholder="#PLAYERTAG"
          class="tag-input"
          @keyup.enter="handleLockIn"
        />
        <div class="focus-glow"></div>
      </div>
      <button class="lock-button" @click="handleLockIn" :disabled="isFetching">
        <Icon v-if="isFetching" name="loader" size="16" class="animate-spin" />
        <span v-else>LOCK IN</span>
      </button>
    </div>

    <div class="status-line">
      <span v-if="playerName" class="status-text loaded">
        Loaded: {{ playerName }}
      </span>
      <span v-else-if="isFetching" class="status-text pending">
        Scanning Target...
      </span>
      <span v-else class="status-text empty">
        No target set
      </span>
    </div>
  </div>
</template>

<style scoped>
.target-card {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--sys-color-surface-container-low);
  border-radius: var(--shape-corner-extra-large);
  border: none;
  transition: opacity 0.3s ease;
}

.is-loading {
  opacity: 0.8;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--sys-color-primary);
}

.label {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.1em;
}

.input-row {
  display: flex;
  gap: 12px;
  align-items: center;
}

.input-wrapper {
  position: relative;
  flex: 1;
}

.tag-input {
  width: 100%;
  background: var(--sys-color-surface-container-lowest);
  border: none;
  padding: 12px 16px;
  border-radius: var(--shape-corner-medium);
  color: var(--sys-color-on-surface);
  font-family: var(--sys-font-family-mono);
  font-size: 16px;
  font-weight: 700;
  text-transform: uppercase;
  transition: all 0.2s ease;
}

.tag-input:focus {
  outline: none;
}

.focus-glow {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--sys-color-primary);
  opacity: 0;
  transition: opacity 0.2s ease, box-shadow 0.2s ease;
  border-radius: 0 0 var(--shape-corner-medium) var(--shape-corner-medium);
}

.tag-input:focus + .focus-glow {
  opacity: 1;
  box-shadow: 0 0 10px var(--sys-color-primary);
}

.lock-button {
  background: linear-gradient(135deg, var(--sys-color-primary), var(--sys-color-primary-container));
  color: var(--sys-color-on-primary);
  border: none;
  padding: 12px 20px;
  min-width: 100px;
  height: 44px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.1s ease;
}

.lock-button:active:not(:disabled) {
  transform: scale(0.95);
}

.lock-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.status-line {
  font-size: 11px;
  font-weight: 600;
  min-height: 16px;
}

.status-text.loaded {
  color: var(--sys-color-on-surface-variant);
}

.status-text.empty, .status-text.pending {
  opacity: 0.5;
  color: var(--sys-color-on-surface);
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
