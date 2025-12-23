<script setup lang="ts">
import { useToast } from '../composables/useToast'
import { useUiCoordinator } from '../composables/useUiCoordinator'
import { computed } from 'vue'
import Toast from './Toast.vue'

const { toasts, remove, triggerAction } = useToast()
const { toastOffset } = useUiCoordinator()

// GPU Optimization: TranslateY instead of 'bottom' property transition
const styleObject = computed(() => ({
    // Base position fixed to bottom + safe area
    bottom: 'calc(0px + env(safe-area-inset-bottom))',
    // Dynamic lift based on UI state (Fab/Dock visibility)
    transform: `translateY(calc(-${toastOffset.value}px))`
}))
</script>

<template>
  <div class="toast-container" :style="styleObject">
    <TransitionGroup name="toast">
      <Toast
        v-for="toast in toasts"
        :key="toast.id"
        v-bind="toast"
        @dismiss="remove"
        @action="triggerAction"
      />
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-container {
  position: fixed;
  left: 50%; 
  /* Center horizontally, but use margin-left to avoid conflict with transform logic */
  margin-left: -50%; 
  width: 100%;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  z-index: 1000;
  pointer-events: none; /* Let clicks pass through around toasts */
  
  /* ⚡ PERF: Animate transform only */
  transition: transform 0.4s var(--sys-motion-spring);
  will-change: transform;
}

/* Transitions */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.toast-enter-from {
  opacity: 0;
  transform: translateY(20px) scale(0.9);
}

.toast-leave-to {
  opacity: 0;
  transform: translateY(-20px) scale(0.9);
}

/* Ensure smooth list reordering */
.toast-move {
  transition: transform 0.3s var(--sys-motion-spring);
}
</style>
