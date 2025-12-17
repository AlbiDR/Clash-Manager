
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { RouterView } from 'vue-router'
import { useClanData } from './composables/useClanData'
import FloatingDock from './components/FloatingDock.vue'
import ToastContainer from './components/ToastContainer.vue'

const { syncStatus } = useClanData()
const isOnline = ref(true)
const connectionType = ref('unknown')

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

    const conn = (navigator as any).connection
    if (conn) {
        connectionType.value = conn.effectiveType
        conn.addEventListener('change', () => {
            connectionType.value = conn.effectiveType
        })
    }
})

const connectionState = computed(() => {
    if (!isOnline.value) return 'offline'
    if (syncStatus.value === 'syncing') return 'syncing'
    if (['slow-2g', '2g'].includes(connectionType.value)) return 'slow'
    return 'online'
})
</script>

<template>
  <div class="app-container">
    <!-- NATIVE FRONTIER: Connectivity Health Strip -->
    <div class="connectivity-strip" :class="connectionState"></div>

    <main class="main-content">
      <RouterView />
    </main>
    
    <FloatingDock />
    <ToastContainer />

    <div v-if="syncStatus === 'syncing' || syncStatus === 'error'" 
         class="sync-indicator"
         :class="{ 'error': syncStatus === 'error' }">
      <div v-if="syncStatus === 'syncing'" class="pulse-dot"></div>
      <span v-if="syncStatus === 'syncing'">Syncing...</span>
      <span v-else>Sync Failed</span>
    </div>
  </div>
</template>

<style scoped>
.connectivity-strip {
  position: fixed;
  top: 0; left: 0; right: 0;
  height: 2px;
  z-index: 3000;
  transition: all 0.3s ease;
  opacity: 0.8;
}

.connectivity-strip.online { background: var(--sys-color-primary); opacity: 0; }
.connectivity-strip.syncing { 
    background: var(--sys-color-primary); 
    opacity: 1;
    box-shadow: 0 0 8px var(--sys-color-primary);
    animation: flow 2s linear infinite;
}
.connectivity-strip.slow { background: #fbbf24; opacity: 1; }
.connectivity-strip.offline { background: var(--sys-color-error); opacity: 1; }

@keyframes flow {
    0% { filter: hue-rotate(0deg); }
    100% { filter: hue-rotate(360deg); }
}

.sync-indicator {
  position: fixed;
  top: calc(16px + env(safe-area-inset-top));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: var(--sys-surface-glass);
  backdrop-filter: blur(20px);
  border: 1px solid var(--sys-surface-glass-border);
  border-radius: var(--shape-corner-full);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--sys-color-on-surface);
  box-shadow: var(--sys-elevation-2);
  z-index: 2000;
  pointer-events: none;
}

.sync-indicator.error {
  background: var(--sys-color-error-container);
  color: var(--sys-color-on-error-container);
}

.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--sys-color-primary);
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% { transform: scale(0.8); opacity: 0.5; }
  50% { transform: scale(1.2); opacity: 1; }
  100% { transform: scale(0.8); opacity: 0.5; }
}
</style>
