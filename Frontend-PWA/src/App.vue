
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

// `isStandalone` logic becomes less critical with direct Vue rendering of ConsoleHeader
// but can remain for other standalone-specific UI adjustments if any.
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
    <div class="connectivity-strip" :class="connectionState"></div>
    
    <!-- PWA Update Notification -->
    <div v-if="needRefresh" class="pwa-update-toast" @click="updateServiceWorker()">
      <div class="update-icon-wrapper">
        <Icon name="download" size="22" />
      </div>
      <div class="update-text">New version available</div>
      <button class="update-btn" @click.stop="updateServiceWorker()">
        Update
      </button>
      <button class="close-update" @click.stop="closeUpdate()">
        <Icon name="close" size="18" />
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
  position: fixed; 
  top: 16px; 
  left: 50%; 
  transform: translateX(-50%);
  z-index: 4000;
  
  /* Match Toast.vue .undo style exactly */
  background: var(--sys-color-inverse-surface);
  color: var(--sys-color-inverse-on-surface);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 99px;
  padding: 12px 20px;
  
  display: flex; 
  align-items: center; 
  gap: 12px;
  
  box-shadow: 0 12px 32px rgba(0,0,0,0.3);
  
  min-width: min(340px, 92vw);
  max-width: 94vw;
  
  animation: slide-down 0.6s var(--sys-motion-spring);
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.pwa-update-toast:active {
  transform: translateX(-50%) scale(0.96);
}

.update-icon-wrapper {
  color: var(--sys-color-inverse-primary);
  display: flex;
  align-items: center;
}

.update-text {
  flex: 1;
  font-weight: 700;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.update-btn {
  background: var(--sys-color-inverse-primary);
  color: var(--sys-color-inverse-surface);
  border: none; 
  padding: 8px 16px;
  border-radius: 99px;
  font-size: 12px; 
  font-weight: 800;
  text-transform: uppercase;
  cursor: pointer;
  transition: filter 0.2s, transform 0.2s;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  white-space: nowrap;
  flex-shrink: 0;
}
.update-btn:active { 
  transform: scale(0.95); 
  filter: brightness(0.9);
}

.close-update {
  background: rgba(255,255,255,0.1);
  border: none; 
  padding: 6px;
  border-radius: 50%;
  cursor: pointer; 
  color: inherit;
  display: flex; 
  align-items: center; 
  justify-content: center;
  margin-left: -4px;
  margin-right: -8px;
  flex-shrink: 0;
  transition: background 0.2s;
}
.close-update:active { background: rgba(255,255,255,0.2); }

@keyframes slide-down { 
  from { transform: translate(-50%, -150%); opacity: 0; } 
  to { transform: translate(-50%, 0); opacity: 1; } 
}

@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

/* Mobile Tweaks */
@media (max-width: 400px) {
  .pwa-update-toast {
    padding: 10px 16px;
    gap: 8px;
  }
  .update-text { font-size: 13px; }
  .update-btn { padding: 6px 12px; font-size: 11px; }
  .close-update { padding: 4px; }
}

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
