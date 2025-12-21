<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useApiState } from '../composables/useApiState'
import ConsoleHeader from '../components/ConsoleHeader.vue'

import PwaInstallBanner from '../components/settings/PwaInstallBanner.vue'
import NetworkSettings from '../components/settings/NetworkSettings.vue'
import AppearanceSettings from '../components/settings/AppearanceSettings.vue'
import PowerTools from '../components/settings/PowerTools.vue'
import Experiments from '../components/settings/Experiments.vue'
import SystemModules from '../components/settings/SystemModules.vue'
import Recovery from '../components/settings/Recovery.vue'

const { apiStatus, checkApiStatus } = useApiState()
const appVersion = __APP_VERSION__

onMounted(() => {
    checkApiStatus()
})

const apiStatusObject = computed(() => {
    if (apiStatus.value === 'online') return { type: 'ready', text: 'Systems Online' } as const
    if (apiStatus.value === 'offline') return { type: 'error', text: 'Disconnected' } as const
    if (apiStatus.value === 'unconfigured') return { type: 'error', text: 'Setup Required' } as const
    return { type: 'loading', text: 'Ping...' } as const
})
</script>

<template>
  <div class="view-container">
    <ConsoleHeader title="Settings" :status="apiStatusObject" />

    <div class="settings-content gpu-contain">
      
      <PwaInstallBanner />

      <NetworkSettings />
      
      <AppearanceSettings />

      <PowerTools />

      <Experiments />

      <SystemModules />

      <Recovery />

      <div class="footer-info">
        <div class="brand">CLASH MANAGER V{{ appVersion }}</div>
        <div class="copy">Copyright © 2026 AlbiDR</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.view-container { min-height: 100vh; }
.settings-content { padding: 12px 0 120px; display: flex; flex-direction: column; gap: 16px; }

.footer-info { padding: 40px 0; text-align: center; }
.brand { font-size: 12px; font-weight: 900; opacity: 0.2; letter-spacing: 0.1em; }
.copy { font-size: 10px; opacity: 0.2; margin-top: 4px; }
</style>
