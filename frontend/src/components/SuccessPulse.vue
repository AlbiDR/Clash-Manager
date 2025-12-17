
<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  trigger: boolean
}>()

const active = ref(false)

watch(() => props.trigger, (newVal) => {
  if (newVal) {
    active.value = true
    // Cleanup after animation completes
    setTimeout(() => {
      active.value = false
    }, 1000)
  }
})
</script>

<template>
  <div v-if="active" class="pulse-container">
    <div class="momentum-wave"></div>
  </div>
</template>

<style scoped>
.pulse-container {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 50; /* Behind headers, over background */
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.momentum-wave {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: transparent;
  border: 4px solid var(--sys-color-success);
  opacity: 0.6;
  filter: blur(2px);
  /* Neo-Material Saturation Shockwave */
  backdrop-filter: saturate(2);
  -webkit-backdrop-filter: saturate(2);
  
  animation: explode 0.8s cubic-bezier(0.1, 0.8, 0.2, 1) forwards;
}

@keyframes explode {
  0% {
    transform: scale(0);
    opacity: 0.8;
    border-width: 40px;
  }
  50% {
    opacity: 0.4;
    border-width: 10px;
  }
  100% {
    transform: scale(30); /* Covers mobile screen and desktop wide */
    opacity: 0;
    border-width: 1px;
  }
}
</style>
