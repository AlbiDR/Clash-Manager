<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import Icon from './Icon.vue'

const props = defineProps<{
  id: string
  type: 'success' | 'error' | 'info' | 'undo'
  message: string
  duration?: number
  actionLabel?: string
}>()

const emit = defineEmits<{
  dismiss: [id: string]
  action: [id: string]
}>()

let timer: number | undefined

function startTimer() {
  if (props.duration) {
    timer = window.setTimeout(() => {
      emit('dismiss', props.id)
    }, props.duration)
  }
}

function clearTimer() {
  if (timer) clearTimeout(timer)
}

function handleMainClick() {
  if (props.actionLabel) {
    emit('action', props.id)
  }
}

onMounted(startTimer)
onUnmounted(clearTimer)
</script>

<template>
  <div 
    class="toast" 
    :class="[type, { 'is-actionable': !!actionLabel }]" 
    @mouseenter="clearTimer" 
    @mouseleave="startTimer"
    @click="handleMainClick"
  >
    <!-- Visual Indicator for Undo (Progress circle or icon) -->
    <div v-if="type === 'undo'" class="icon-side undo-icon">
        <Icon name="undo" size="18" />
    </div>
    
    <div v-else class="icon-side">
      <Icon v-if="type === 'success'" name="check" size="20" />
      <Icon v-else-if="type === 'error'" name="warning" size="20" />
      <Icon v-else name="info" size="20" />
    </div>
    
    <div class="message">{{ message }}</div>
    
    <button v-if="actionLabel" class="action-btn" @click.stop="$emit('action', id)">
      {{ actionLabel }}
    </button>
    
    <button class="close-btn" @click.stop="$emit('dismiss', id)">
      <Icon name="close" size="16" />
    </button>
  </div>
</template>

<style scoped>
.toast {
  display: flex; align-items: center; gap: 12px;
  background: var(--sys-surface-glass);
  backdrop-filter: var(--sys-surface-glass-blur);
  -webkit-backdrop-filter: var(--sys-surface-glass-blur);
  color: var(--sys-color-on-surface);
  padding: 10px 16px;
  border-radius: 99px; /* Pill shape */
  box-shadow: 0 8px 32px rgba(0,0,0,0.15);
  min-width: 280px; max-width: 90vw;
  border: 1px solid var(--sys-surface-glass-border);
  pointer-events: auto;
  transition: transform 0.2s var(--sys-motion-spring), box-shadow 0.2s;
  user-select: none;
}

.toast.is-actionable {
  cursor: pointer;
}
.toast.is-actionable:active {
  transform: scale(0.96);
}

/* Success State */
.toast.success { 
  background: var(--sys-color-success-container); 
  color: var(--sys-color-on-success-container); /* Check var usage if needed */
  color: #002105; /* Fallback high contrast */
  border-color: rgba(0,0,0,0.05);
}

/* Error State */
.toast.error { 
  background: var(--sys-color-error-container); 
  color: var(--sys-color-on-error-container); 
  border-color: rgba(0,0,0,0.05);
}

/* Undo State (Premium Dark Glass) */
.toast.undo {
  background: var(--sys-color-inverse-surface);
  color: var(--sys-color-inverse-on-surface);
  border: 1px solid rgba(255,255,255,0.1);
  padding: 12px 20px;
}

.icon-side { display: flex; align-items: center; opacity: 0.9; }

.undo-icon {
    color: var(--sys-color-inverse-primary);
}

.message { 
    flex: 1; 
    font-weight: 700; 
    font-size: 14px; 
    line-height: 1.4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.action-btn {
  background: var(--sys-color-inverse-primary);
  color: var(--sys-color-inverse-surface);
  border: none; border-radius: 99px;
  padding: 6px 14px;
  font-weight: 800; font-size: 12px; text-transform: uppercase;
  cursor: pointer; transition: filter 0.2s;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
.action-btn:active { filter: brightness(0.9); transform: translateY(1px); }

/* Standard Action Btn (Non-Undo) */
.toast:not(.undo) .action-btn {
    background: var(--sys-color-primary);
    color: var(--sys-color-on-primary);
    box-shadow: none;
}

.close-btn {
  background: none; border: none;
  color: inherit; opacity: 0.5;
  cursor: pointer; padding: 4px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  transition: opacity 0.2s;
  margin-left: -4px;
}
.close-btn:hover { opacity: 1; background: rgba(255,255,255,0.1); }
</style>
