<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  timestamp: number
  loading: boolean
  error: string | null
}>()

const emit = defineEmits<{
  'refresh': []
}>()

const timeAgo = computed(() => {
  if (!props.timestamp) return 'Never'
  
  const now = Date.now()
  const diff = now - props.timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  
  if (seconds < 10) return 'Just now'
  if (seconds < 60) return `${seconds}s ago`
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
})

const stateClass = computed(() => {
  if (props.error) return 'error'
  if (props.loading) return 'loading'
  return 'ready'
})

function handleClick() {
  if (!props.loading) {
    emit('refresh')
  }
}
</script>

<template>
  <button 
    class="freshness-pill" 
    :class="stateClass"
    @click="handleClick"
    :disabled="loading"
  >
    <div v-if="loading" class="spinner"></div>
    <span class="pill-text">{{ loading ? 'Syncing...' : error ? 'Error' : timeAgo }}</span>
  </button>
</template>

<style scoped>
.freshness-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: var(--shape-corner-full);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  cursor: pointer;
  border: none;
  transition: all 0.3s var(--sys-motion-spring);
  background: var(--sys-color-surface-container-high);
  color: var(--sys-color-on-surface-variant);
}

.freshness-pill:hover:not(:disabled) {
  background: var(--sys-color-surface-variant);
  transform: scale(1.02);
}

.freshness-pill:active:not(:disabled) {
  transform: scale(0.95);
}

.freshness-pill:disabled {
  cursor: default;
  opacity: 0.9;
}

.freshness-pill.ready {
  background: var(--sys-color-primary-container);
  color: var(--sys-color-on-primary-container);
}

.freshness-pill.loading {
  background: var(--sys-color-secondary-container);
  color: var(--sys-color-on-secondary-container);
}

.freshness-pill.error {
  background: var(--sys-color-error-container);
  color: var(--sys-color-on-error-container);
}

.pill-text {
  white-space: nowrap;
}

.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
