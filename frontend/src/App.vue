
<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { RouterView } from 'vue-router'
import { useClanData } from './composables/useClanData'
import FloatingDock from './components/FloatingDock.vue'
import ToastContainer from './components/ToastContainer.vue'
import SuccessPulse from './components/SuccessPulse.vue'

const { syncStatus } = useClanData()
const isOnline = ref(true)
const connectionType = ref('unknown')
const triggerSuccessEffect = ref(false)

// Watch for sync success to trigger the "Momentum Explosion"
watch(syncStatus, (newStatus, oldStatus) => {
    if (oldStatus === 'syncing' && newStatus === 'success') {
        triggerSuccessEffect.value = true
        // Native Success Haptic Signature
        if (navigator.vibrate) navigator.vibrate([20, 50, 20])
        
        // Reset the trigger so it can fire again
        setTimeout(() => {
            triggerSuccessEffect.value = false
        }, 100)
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

    <!-- NEO-MATERIAL: Success Momentum Explosion -->
    <SuccessPulse :trigger="triggerSuccessEffect" />

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
  transition: opacity 0.4s ease, background-color 0.4s ease;
  opacity: 0;
}

/* Hard Offline: Static Red */
.connectivity-strip.offline { 
  background-color: var(--sys-color-error); 
  opacity: 1; 
}

/* Slow Connection: Static Amber */
.connectivity-strip.slow { 
  background-color: #fbbf24; 
  opacity: 1; 
}

/* Syncing: Animated Blue Shimmer */
.connectivity-strip.syncing { 
  opacity: 1;
  background: linear-gradient(
    90deg, 
    var(--sys-color-primary) 0%, 
    var(--sys-color-primary-container) 50%, 
    var(--sys-color-primary) 100%
  );
  background-size: 200% 100%;
  animation: shimmer-data 1.5s linear infinite;
  box-shadow: 0 0 8px rgba(var(--sys-color-primary-rgb), 0.4);
}

/* Online/Healthy: Invisible */
.connectivity-strip.online { 
  opacity: 0; 
}

@keyframes shimmer-data {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
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

