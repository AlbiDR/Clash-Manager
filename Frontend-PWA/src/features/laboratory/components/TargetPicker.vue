<script setup lang="ts">
import { ref, watch } from "vue";
import { Icon } from "@shared";
import { useHaptics } from "@core";

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
    const formattedTag = tag.startsWith('#') ? tag.toUpperCase() : `#${tag.toUpperCase()}`;
    emit("lockIn", formattedTag);
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
  background: var(--sys-surf-h);
  border-radius: 14px;
  display: flex;
  align-items: center;
  padding: 0 4px 0 12px;
  gap: 8px;
  border: 1px solid rgba(128, 128, 128, 0.15);
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.02);
  transition: all 0.2s ease;
  flex: 1;
}

.input-box:focus-within {
  border-color: var(--sys-primary-muted);
}

.prefix-icon {
  color: var(--sys-text-tertiary);
  flex-shrink: 0;
}

.tag-input {
  flex: 1;
  background: none;
  border: none;
  color: var(--sys-text-primary);
  font-size: 13px;
  font-weight: 700;
  font-family: var(--sys-font-mono);
  outline: none;
  width: 0; /* Allow flex to shrink */
  text-transform: uppercase;
}

.tag-input::placeholder {
  color: var(--sys-text-tertiary);
  font-weight: 500;
  opacity: 0.5;
}

.lock-btn {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: var(--sys-primary);
  border: none;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s var(--sys-motion-standard);
  flex-shrink: 0;
}

.lock-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px var(--sys-primary-muted);
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
  padding: 0 10px;
  height: 40px;
  background: var(--sys-surf-c);
  border-radius: 12px;
  border: 1px solid rgba(128, 128, 128, 0.1);
  white-space: nowrap;
  max-width: 120px;
  overflow: hidden;
}

.label-text {
  font-size: 11px;
  font-weight: 800;
  color: var(--sys-primary);
  text-transform: uppercase;
  overflow: hidden;
  text-overflow: ellipsis;
}

.is-fetching .lock-btn {
  background: var(--sys-surf-c);
  color: var(--sys-text-tertiary);
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
