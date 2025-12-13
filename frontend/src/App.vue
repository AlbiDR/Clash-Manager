<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useApiState } from './composables/useApiState'
import { useClanData } from './composables/useClanData'
import FloatingDock from './components/FloatingDock.vue'

// 1. Initialize API state to run the check
useApiState() 

// 2. Initialize Data Layer (SWR)
const { init, syncStatus } = useClanData()
onMounted(() => {
    init()
})

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
/* Page Transitions */
.page-enter-active,
.page-leave-active {
  transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.2, 0, 0, 1);
}

.page-enter-from { opacity: 0; transform: translateY(8px); }
.page-leave-to { opacity: 0; transform: translateY(-8px); }

/* Sync Indicator */
.sync-indicator {
  position: fixed;
  top: 16px;
  right: 16px; /* or center, but right is less intrusive */
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--sys-surface-glass);
  backdrop-filter: blur(20px);
  border: 1px solid var(--sys-surface-glass-border);
  border-radius: var(--shape-corner-full);
  font-size: 13px;
  font-weight: 600;
  color: var(--sys-color-on-surface);
  box-shadow: var(--sys-elevation-2);
  z-index: 9999;
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
