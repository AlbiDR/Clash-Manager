
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
    <div class="icon-side">
      <Icon v-if="type === 'success'" name="check" size="20" />
      <Icon v-else-if="type === 'error'" name="warning" size="20" />
      <Icon v-else-if="type === 'undo'" name="undo" size="20" />
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
  background: var(--sys-color-surface-container-high);
  color: var(--sys-color-on-surface);
  padding: 12px 16px;
  border-radius: var(--shape-corner-m);
  box-shadow: var(--sys-elevation-3);
  min-width: 300px; max-width: 90vw;
  border: 1px solid var(--sys-color-outline-variant);
  pointer-events: auto;
  transition: transform 0.2s, box-shadow 0.2s;
}

.toast.is-actionable {
  cursor: pointer;
}
.toast.is-actionable:active {
  transform: scale(0.98);
}

.toast.success { background: var(--sys-color-primary-container); color: var(--sys-color-on-primary-container); border: none; }
.toast.error { background: var(--sys-color-error-container); color: var(--sys-color-on-error-container); border: none; }
.toast.undo { background: var(--sys-color-inverse-surface); color: var(--sys-color-inverse-on-surface); border: none; }

.icon-side { display: flex; align-items: center; }

.message { flex: 1; font-weight: 500; font-size: 14px; line-height: 1.4; }

.action-btn {
  background: rgba(255,255,255,0.15);
  border: none; border-radius: 4px;
  padding: 4px 8px;
  color: inherit; font-weight: 700; font-size: 13px; text-transform: uppercase;
  cursor: pointer; transition: background 0.2s;
}
.action-btn:hover { background: rgba(255,255,255,0.25); }

.close-btn {
  background: none; border: none;
  color: inherit; opacity: 0.6;
  cursor: pointer; padding: 4px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
}
.close-btn:hover { opacity: 1; background: rgba(0,0,0,0.05); }
</style>
