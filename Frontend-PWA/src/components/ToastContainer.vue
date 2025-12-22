<script setup lang="ts">
import { useToast } from '../composables/useToast'
import { useUiCoordinator } from '../composables/useUiCoordinator'
import Toast from './Toast.vue'

const { toasts, remove, triggerAction } = useToast()
const { toastOffset } = useUiCoordinator()
</script>

<template>
  <div class="toast-container" :style="{ bottom: `calc(${toastOffset}px + env(safe-area-inset-bottom))` }">
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
  left: 50%; transform: translateX(-50%);
  display: flex; flex-direction: column; gap: 8px;
  z-index: 1000;
  pointer-events: none; /* Let clicks pass through around toasts */
  transition: bottom 0.4s var(--sys-motion-spring);
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
