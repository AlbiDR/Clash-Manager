<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useClanData } from './composables/useClanData'
import FloatingDock from './components/FloatingDock.vue'
import ToastContainer from './components/ToastContainer.vue'

// Read-only access to sync status for the UI indicator
const { syncStatus } = useClanData()

const isOnline = ref(true)

onMounted(() => {
    isOnline.value = navigator.onLine
    window.addEventListener('online', () => isOnline.value = true)
    window.addEventListener('offline', () => isOnline.value = false)
})
</script>

<template>
  <div class="app-container">
    <main class="main-content">
      <RouterView v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <KeepAlive>
            <component :is="Component" />
          </KeepAlive>
        </Transition>
      </RouterView>
    </main>
    
    <FloatingDock />
    
    <ToastContainer />

    <!-- SYNC INDICATOR (Glass Badge) -->
    <Transition name="fade">
      <div v-if="syncStatus === 'syncing' || syncStatus === 'error'" 
           class="sync-indicator"
           :class="{ 'error': syncStatus === 'error' }">
        <div v-if="syncStatus === 'syncing'" class="pulse-dot"></div>
        <span v-if="syncStatus === 'syncing'">Syncing...</span>
        <span v-else>Sync Failed</span>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Page Transitions (Modern Scale-Fade) */
.page-enter-active,
.page-leave-active {
  transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.2, 0, 0, 1);
}

.page-enter-from { opacity: 0; transform: translateY(10px) scale(0.98); }
.page-leave-to { opacity: 0; transform: translateY(-10px) scale(0.98); }

/* Sync Indicator */
.sync-indicator {
  position: fixed;
  top: calc(12px + env(safe-area-inset-top)); /* Match Header top margin */
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
  z-index: 2000; /* Above Header */
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

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
