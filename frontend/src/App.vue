
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

// Watch for sync success to trigger the temporary "Resolve" state
watch(syncStatus, (newStatus, oldStatus) => {
    if (oldStatus === 'syncing' && newStatus === 'success') {
        isSuccessFading.value = true
        // Native Success Haptic Signature (Subtle nudge)
        if (navigator.vibrate) navigator.vibrate([10, 30])
        
        // Keep the green state visible for a moment of feedback
        setTimeout(() => {
            isSuccessFading.value = false
        }, 1800)
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
    if (isSuccessFading.value) return 'success-resolve'
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

    <!-- Subtle Sync Status (Contextual) -->
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
  transition: opacity 0.6s ease, background-color 0.4s ease, box-shadow 0.4s ease;
  opacity: 0;
  pointer-events: none;
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
  box-shadow: 0 1px 4px rgba(var(--sys-color-primary-rgb), 0.3);
}

/* SUCCESS RESOLVE: The "Elegant Nudge" 
   Transforms the strip to green with a subtle top bloom */
.connectivity-strip.success-resolve {
  opacity: 1;
  background-color: #22c55e; /* Vibrant Success Green */
  box-shadow: 0 4px 15px rgba(34, 197, 94, 0.4);
  /* Force a quick pop animation */
  animation: resolve-pop 0.4s cubic-bezier(0.17, 0.67, 0.83, 0.67);
}

@keyframes resolve-pop {
  0% { transform: scaleY(1); }
  50% { transform: scaleY(2); }
  100% { transform: scaleY(1); }
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

