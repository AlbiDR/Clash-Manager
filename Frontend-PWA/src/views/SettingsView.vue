
<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useApiState } from '../composables/useApiState'
import { useModules } from '../composables/useModules'
import ConsoleHeader from '../components/ConsoleHeader.vue'

import PwaInstallBanner from '../components/settings/PwaInstallBanner.vue'
import NetworkSettings from '../components/settings/NetworkSettings.vue'
import AppearanceSettings from '../components/settings/AppearanceSettings.vue'
import ExtraFeatures from '../components/settings/ExtraFeatures.vue'
import Experiments from '../components/settings/Experiments.vue'
import SystemModules from '../components/settings/SystemModules.vue'
import Recovery from '../components/settings/Recovery.vue'
import BackendRefresher from '../components/settings/BackendRefresher.vue'
import NotificationSettings from '../components/settings/NotificationSettings.vue'
import SkeletonSettingsCard from '../components/SkeletonSettingsCard.vue' // Import new skeleton
import { useDemoMode } from '../composables/useDemoMode'
import { useLongPress } from '../composables/useLongPress'
import { useToast } from '../composables/useToast'
import { vTactile } from '../directives/vTactile'
import { useClanData } from '../composables/useClanData' // Import useClanData

const { apiStatus, checkApiStatus } = useApiState()
const { modules } = useModules()
const { isDemoMode, toggleDemoMode } = useDemoMode()
const { info } = useToast()
const appVersion = __APP_VERSION__
const { isHydrated, isRefreshing } = useClanData() // Get hydration and refreshing status

const { start: startLongPress, cancel: cancelLongPress } = useLongPress(() => {
    info(isDemoMode.value ? 'Switching to Live Mode...' : 'Developer Mode: Activating Demo Data...')
    setTimeout(toggleDemoMode, 800)
}, 1500)

onMounted(() => {
    checkApiStatus()
})

const apiStatusObject = computed(() => {
    if (apiStatus.value === 'online') return { type: 'ready', text: 'Systems Online' } as const
    if (apiStatus.value === 'offline') return { type: 'error', text: 'Disconnected' } as const
    if (apiStatus.value === 'unconfigured') return { type: 'error', text: 'Setup Required' } as const
    return { type: 'loading', text: 'Ping...' } as const
})

const showSkeletons = computed(() => !isHydrated.value || isRefreshing.value)
</script>

<template>
  <div class="view-container">
    <ConsoleHeader title="Settings" :status="apiStatusObject" :loading="showSkeletons" />

    <div class="settings-content gpu-contain">
      
      <PwaInstallBanner v-if="!showSkeletons" />

      <template v-if="showSkeletons">
        <!-- Render multiple skeleton cards when loading -->
        <SkeletonSettingsCard v-for="i in 6" :key="i" :index="i" />
      </template>
      <template v-else>
        <NetworkSettings />
        
        <AppearanceSettings />

        <ExtraFeatures />

        <NotificationSettings />

        <Experiments />

        <BackendRefresher v-if="modules.backendRefresher" />

        <SystemModules />

        <Recovery />
      </template>

      <div 
        class="footer-info"
        v-tactile
        @mousedown="startLongPress"
        @mouseup="cancelLongPress"
        @mouseleave="cancelLongPress"
        @touchstart="startLongPress"
        @touchend="cancelLongPress"
      >
        <div class="brand">
            CLASH MANAGER V{{ appVersion }}
            <span v-if="isDemoMode" class="demo-tag">DEMO</span>
        </div>
        <div class="copy">Copyright © 2026 AlbiDR</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.view-container { min-height: 100vh; }
.settings-content { padding: 12px 0 120px; display: flex; flex-direction: column; gap: 16px; }

.footer-info { padding: 40px 0; text-align: center; cursor: pointer; user-select: none; }
.brand { font-size: 12px; font-weight: 900; opacity: 0.2; letter-spacing: 0.1em; display: flex; align-items: center; justify-content: center; gap: 8px; }
.demo-tag { 
  background: var(--sys-color-primary); 
  color: var(--sys-color-on-primary); 
  font-size: 8px; 
  padding: 2px 6px; 
  border-radius: 4px;
  letter-spacing: 0;
  opacity: 1;
}
.copy { font-size: 10px; opacity: 0.2; margin-top: 4px; }
</style>
