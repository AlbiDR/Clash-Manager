
<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { useClanData } from './composables/useClanData'
import { usePwaUpdate } from './composables/usePwaUpdate'
import { useHaptics } from './composables/useHaptics'
import FloatingDock from './components/FloatingDock.vue'
import ToastContainer from './components/ToastContainer.vue'
import Icon from './components/Icon.vue'
import ErrorBoundary from './components/ErrorBoundary.vue'

import { useShareTarget } from './composables/useShareTarget'
import { useAppBadge } from './composables/useAppBadge'

const { syncStatus } = useClanData()
const { needRefresh, updateServiceWorker, close: closeUpdate } = usePwaUpdate()
const { handleShareTarget } = useShareTarget()
const { clearBadge } = useAppBadge()
const haptics = useHaptics()
const route = useRoute()
const isOnline = ref(true)
const isSuccessFading = ref(false)

const isStandalone = computed(() => {
    return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true
})

watch(syncStatus, (newStatus, oldStatus) => {
    if (oldStatus === 'syncing' && newStatus === 'success') {
        isSuccessFading.value = true
        haptics.success()
        clearBadge() // Clear any stale badges on fresh sync
        setTimeout(() => { isSuccessFading.value = false }, 1800)
    }
})

onMounted(() => {
    isOnline.value = navigator.onLine
    clearBadge() // Clear badge when app is opened
    
    window.addEventListener('online', () => {
        isOnline.value = true
        haptics.success()
    })
    window.addEventListener('offline', () => {
        isOnline.value = false
        haptics.error()
    })
    
    // Check for share target data on mount
    handleShareTarget()
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
    <div class="connectivity-strip" :class="[connectionState, { 'is-standalone': isStandalone }]"></div>
    
    <!-- PWA Update Notification -->
    <div v-if="needRefresh" class="pwa-update-toast">
      <div class="update-content">
        <Icon name="download" size="20" />
        <span>New version available</span>
      </div>
      <button class="update-btn" @click="updateServiceWorker()">
        Refresh
      </button>
      <button class="close-update" @click="closeUpdate()">
        <Icon name="close" size="16" />
      </button>
    </div>

    <main class="app-container">
      <ErrorBoundary>
        <RouterView v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" :key="route.fullPath" />
          </transition>
        </RouterView>
      </ErrorBoundary>
    </main>
    <FloatingDock />
    <ToastContainer />
  </div>
</template>

<style scoped>
.app-shell { 
  min-height: 100vh;
  background-color: var(--sys-color-background);
}
.app-container { 
  max-width: var(--sys-layout-max-width); 
  margin: 0 auto; 
  padding: 0 16px; 
}

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

/* PWA Update Toast */
.pwa-update-toast {
  position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
  background: var(--sys-color-secondary-container);
  color: var(--sys-color-on-secondary-container);
  border: 1px solid var(--sys-color-outline-variant);
  padding: 8px 12px;
  border-radius: 99px;
  z-index: 4000;
  display: flex; align-items: center; gap: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  animation: slide-down 0.4s var(--sys-motion-spring);
}

.update-content {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; font-weight: 600;
}

.update-btn {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  border: none; padding: 6px 12px;
  border-radius: 99px;
  font-size: 12px; font-weight: 700;
  cursor: pointer;
}

.close-update {
  background: none; border: none; padding: 4px;
  cursor: pointer; opacity: 0.6;
  display: flex; align-items: center;
}

@keyframes slide-down { from { transform: translate(-50%, -20px); opacity: 0; } }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

/* Page Transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
