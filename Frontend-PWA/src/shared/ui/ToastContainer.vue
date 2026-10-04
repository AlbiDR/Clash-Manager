<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import Toast from "./Toast.vue";
import { useUiCoordinator, useToast } from "../../core";
import { computed } from "vue";
const {
  toasts,
  remove,
  pauseDismissal,
  resumeDismissal,
  triggerAction,
} = useToast();
const { toastOffset } = useUiCoordinator();

// GPU Optimization: TranslateY instead of 'bottom' property transition
const containerStyle = computed(() => ({
  // Base position fixed to bottom + safe area + Showcase frame inset
  bottom: "calc(0px + var(--sys-safe-bottom) + var(--safe-frame-offset, 0px))",
  // Dynamic lift based on UI state (Fab/Dock visibility)
  "--toast-offset": `${toastOffset.value}px`,
  transform: `translate(-50%, calc(-${toastOffset.value}px))`,
}));
</script>

<template>
  <div 
    class="toast-container" 
    :style="containerStyle"
    role="status"
    aria-live="polite"
    aria-atomic="false"
  >
    <TransitionGroup name="toast">
      <Toast
        v-for="toast in toasts"
        :key="toast.id"
        v-bind="toast"
        @dismiss="remove"
        @action="triggerAction"
        @pause-dismissal="pauseDismissal"
        @resume-dismissal="resumeDismissal"
      />
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-container {
  position: fixed;
  left: var(--sys-safe-center-x);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sys-space-8);
  max-height: calc(
    100dvh
    - var(--sys-safe-top)
    - var(--sys-safe-bottom)
    - var(--toast-offset, 0px)
    - var(--sys-space-24)
  );
  padding: var(--sys-space-4);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  z-index: var(--sys-z-toast);
  pointer-events: none; /* Let clicks pass through around toasts */

  /* [PERF] PERF: Animate transform only */
  transition: transform var(--sys-motion-duration-400) var(--sys-motion-spring);
}

/* Transitions */
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity var(--sys-motion-duration-300) cubic-bezier(0.4, 0, 0.2, 1),
    transform var(--sys-motion-duration-300) cubic-bezier(0.4, 0, 0.2, 1);
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
  transition: transform var(--sys-motion-duration-300) var(--sys-motion-spring);
}

/* The global reduced-motion policy removes transform from transition-property.
   Clear the translated start/end poses as well, or they still snap one frame
   before the remaining opacity fade begins. */
:global(:root[data-motion-preference="reduced"] .toast-enter-from),
:global(:root[data-motion-preference="reduced"] .toast-leave-to) {
  transform: none;
}

@media (prefers-reduced-motion: reduce) {
  :global(:root:not([data-motion-preference="standard"]) .toast-enter-from),
  :global(:root:not([data-motion-preference="standard"]) .toast-leave-to) {
    transform: none;
  }
}
</style>
