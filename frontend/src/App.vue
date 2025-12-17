<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { RouterView } from 'vue-router'
import { useClanData } from './composables/useClanData'
import FloatingDock from './components/FloatingDock.vue'
import ToastContainer from './components/ToastContainer.vue'

const { syncStatus } = useClanData()
const isOnline = ref(true)
const connectionType = ref('unknown')
const isSuccessFading = ref(false)

watch(syncStatus, (newStatus, oldStatus) => {
    if (oldStatus === 'syncing' && newStatus === 'success') {
        isSuccessFading.value = true
        if (navigator.vibrate) navigator.vibrate([10, 30])
        setTimeout(() => { isSuccessFading.value = false }, 1800)
    }
})

onMounted(() => {
    isOnline.value = navigator.onLine
    window.addEventListener('online', () => {
        isOnline.value = true
        if (navigator.vibrate) navigator.vibrate([10, 30, 10])
    })
    window.addEventListener('offline', () => {
        isOnline.value = false
        if (navigator.vibrate) navigator.vibrate(50)
    })
})

const connectionState = computed(() => {
    if (!isOnline.value) return 'offline'
    if (isSuccessFading.value) return 'success-resolve'
    if (syncStatus.value === 'syncing') return 'syncing'
    return 'online'
})
</script>

<template>
  <div class="app-shell">
    <div class="connectivity-strip" :class="connectionState"></div>
    <main class="app-container">
      <RouterView />
    </main>
    <FloatingDock />
    <ToastContainer />
  </div>
</template>

<style scoped>
.app-shell { min-height: 100vh; }
.app-container { max-width: var(--sys-layout-max-width); margin: 0 auto; padding: 0 16px; }

.connectivity-strip {
  position: fixed; top: 0; left: 0; right: 0;
  height: 3px; z-index: 3000;
  opacity: 0; transition: all 0.4s ease;
  pointer-events: none;
}
.connectivity-strip.offline { background: var(--sys-color-error); opacity: 1; }
.connectivity-strip.syncing { 
  opacity: 1;
  background: linear-gradient(90deg, transparent, var(--sys-color-primary), transparent);
  background-size: 200% 100%;
  animation: shimmer 1.5s linear infinite;
}
.connectivity-strip.success-resolve { background: #22c55e; opacity: 1; transform: scaleY(1.5); }

@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
</style>
