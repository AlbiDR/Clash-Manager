<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

defineOptions({ name: 'PullToRefresh' })

const props = defineProps<{
  disabled?: boolean
}>()

const emit = defineEmits<{
  refresh: []
}>()

import { useHaptics } from '../composables/useHaptics'
const haptics = useHaptics()
const pulling = ref(false)
const refreshing = ref(false)
const pullY = ref(0)
const threshold = 100
let startY = 0

function handleStart(e: TouchEvent) {
  if (props.disabled || refreshing.value) return
  if (window.scrollY > 0) return
  if (!e.touches[0]) return
  
  startY = e.touches[0].clientY
  pulling.value = true
}

function handleMove(e: TouchEvent) {
  if (!pulling.value || refreshing.value) return
  if (!e.touches[0]) return
  
  const y = e.touches[0].clientY
  const diff = y - startY
  
  if (window.scrollY === 0 && diff > 0) {
    // Apply resistance
    pullY.value = Math.pow(diff, 0.8)
    
    // Prevent default scroll if we're pulling to refresh
    if (pullY.value > 10) {
      if (e.cancelable) e.preventDefault()
    }
  } else {
    pulling.value = false
    pullY.value = 0
  }
}

function handleEnd() {
  if (!pulling.value || refreshing.value) return
  
  if (pullY.value >= threshold) {
    refreshing.value = true
    pullY.value = threshold // Snap to threshold
    haptics.sync()
    emit('refresh')
    
    // Auto-reset after explicit job done or timeout
    setTimeout(() => {
      refreshing.value = false
      pullY.value = 0
    }, 2000)
  } else {
    pullY.value = 0
  }
  
  pulling.value = false
}

// Global listeners for better touch handling
onMounted(() => {
  document.addEventListener('touchstart', handleStart, { passive: true })
  document.addEventListener('touchmove', handleMove, { passive: false })
  document.addEventListener('touchend', handleEnd)
})

onUnmounted(() => {
  document.removeEventListener('touchstart', handleStart)
  document.removeEventListener('touchmove', handleMove)
  document.removeEventListener('touchend', handleEnd)
})
// Computed styles to avoid template object parsing issues in vue-tsc
const indicatorStyle = computed(() => ({ 
  transform: `translateY(${pullY.value}px)` 
}))

const iconStyle = computed(() => ({ 
  opacity: Math.min(1, pullY.value / threshold) 
}))

const indicatorClass = computed(() => 
  refreshing.value ? 'ptr-indicator refreshing' : 'ptr-indicator'
)
</script>

<template>
  <div 
    :class="indicatorClass"
    :style="indicatorStyle"
  >
    <div class="ptr-content">
      <div v-if="refreshing" class="ptr-spinner"></div>
      <div v-else class="ptr-icon" :style="iconStyle">
        ⬇️
      </div>
    </div>
  </div>
</template>

<style scoped>
.ptr-indicator {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 0;
  display: flex;
  justify-content: center;
  align-items: flex-end; /* content at bottom of 0-height */
  pointer-events: none;
  z-index: 1000;
  opacity: 1; /* Always visible for transform */
}

.ptr-content {
  margin-top: -60px; /* Hide above viewport initially */
  height: 60px;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.ptr-icon {
  font-size: 24px;
}

.ptr-spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--sys-color-primary);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
