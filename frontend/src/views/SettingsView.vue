<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useApiState } from '../composables/useApiState'
import { useInstallPrompt } from '../composables/useInstallPrompt'
import { useModules } from '../composables/useModules'
import { useTheme } from '../composables/useTheme'
import ConsoleHeader from '../components/ConsoleHeader.vue'
import Icon from '../components/Icon.vue'

const newApiUrl = ref('') 
const isEditing = ref(false)

const { apiUrl, apiStatus, pingData, checkApiStatus } = useApiState()
const { isInstallable, install } = useInstallPrompt()
const { modules, toggle } = useModules()
const { theme, setTheme } = useTheme()

onMounted(() => {
    checkApiStatus()
})

watch(apiStatus, (newVal) => {
    if (newVal === 'unconfigured') isEditing.value = true
}, { immediate: true })

const hasLocalOverride = computed(() => !!localStorage.getItem('cm_gas_url'))

function saveApiUrl() {
    if (newApiUrl.value.trim()) {
        localStorage.setItem('cm_gas_url', newApiUrl.value.trim())
        window.location.reload()
    }
}

function resetApiUrl() {
    if(confirm('Reset API URL to default?')) {
        localStorage.removeItem('cm_gas_url')
        window.location.reload()
    }
}

function factoryReset() {
    if (confirm('Reset Application Data?\n\nThis will clear local cache and settings. Data on the Google Sheet will NOT be affected.')) {
        localStorage.clear();
        sessionStorage.clear();
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(regs => {
                for(let r of regs) r.unregister()
                window.location.reload();
            })
        } else window.location.reload();
    }
}

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
      
      <!-- PWA Install Banner -->
      <div v-if="isInstallable" class="install-banner" @click="install">
        <Icon name="download" size="24" />
        <div class="ib-text">
          <div class="ib-title">Install PWA</div>
          <div class="ib-desc">Unlock full native features and speed</div>
        </div>
        <Icon name="chevron_right" size="20" class="arrow" />
      </div>

      <!-- Section: Network -->
      <div class="settings-card">
        <div class="card-header">
          <Icon name="plug" size="20" class="header-icon" />
          <h3>Network & API</h3>
          <div class="status-indicator" :class="apiStatus"></div>
        </div>
        
        <div class="card-body">
          <div class="network-stats">
            <div class="stat-box">
              <span class="label">Latency</span>
              <span class="value">{{ pingData?.latency || '--' }}<small>ms</small></span>
            </div>
            <div class="stat-box">
              <span class="label">Backend</span>
              <span class="value">v{{ pingData?.version || '0.0' }}</span>
            </div>
            <div class="stat-box">
              <span class="label">Cache</span>
              <span class="value">Ready</span>
            </div>
          </div>

          <div class="url-manager">
            <div class="field-label">API ENDPOINT</div>
            <div v-if="!isEditing" class="url-readout">
              <span class="url-text">{{ apiUrl }}</span>
              <button class="edit-btn" @click="isEditing = true">Edit</button>
            </div>
            <div v-else class="url-input-row">
              <input v-model="newApiUrl" type="text" placeholder="https://script.google.com/..." class="glass-input" />
              <button class="save-btn" @click="saveApiUrl"><Icon name="check" size="20" /></button>
              <button class="cancel-btn" @click="isEditing = false">X</button>
            </div>
            <div v-if="hasLocalOverride" class="override-pill" @click="resetApiUrl">
              Running custom override • Tap to reset
            </div>
          </div>
        </div>
      </div>

      <!-- Section: Visuals -->
      <div class="settings-card">
        <div class="card-header">
          <Icon name="gear" size="20" class="header-icon" />
          <h3>Appearance</h3>
        </div>
        <div class="card-body">
          <div class="theme-switch">
            <button 
              class="theme-btn" 
              :class="{ active: theme === 'light' }" 
              @click="setTheme('light')"
              title="Light Mode"
            >
              <Icon name="theme_light" size="20" />
            </button>
            <button 
              class="theme-btn" 
              :class="{ active: theme === 'auto' }" 
              @click="setTheme('auto')"
              title="Auto / System"
            >
              <Icon name="theme_auto" size="20" />
            </button>
            <button 
              class="theme-btn" 
              :class="{ active: theme === 'dark' }" 
              @click="setTheme('dark')"
              title="Dark Mode"
            >
              <Icon name="moon" size="20" />
            </button>
          </div>
        </div>
      </div>

      <!-- Section: Power Tools -->
      <div class="settings-card">
        <div class="card-header">
          <Icon name="lightning" size="20" class="header-icon" />
          <h3>Power Tools</h3>
        </div>
        <div class="card-body">
          <div class="features-list">
            <div class="toggle-row" @click="toggle('blitzMode')">
                <div class="row-info">
                <div class="row-label">Blitz Mode</div>
                <div class="row-desc">Multi-tab profile navigation engine</div>
                </div>
                <div class="switch" :class="{ active: modules.blitzMode }">
                <div class="handle"></div>
                </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Section: Experiments -->
      <div class="settings-card">
        <div class="card-header">
          <Icon name="flask" size="20" class="header-icon" />
          <h3>Experiments</h3>
        </div>
        <div class="card-body">
          <div class="features-list">
            <div class="toggle-row" @click="toggle('ghostBenchmarking')">
                <div class="row-info">
                <div class="row-label">Ghost Benchmarking</div>
                <div class="row-desc">Visualize clan averages inside stat tooltips</div>
                </div>
                <div class="switch" :class="{ active: modules.ghostBenchmarking }">
                <div class="handle"></div>
                </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Section: Modules -->
      <div v-if="pingData?.modules" class="settings-card">
        <div class="card-header">
          <Icon name="box" size="20" class="header-icon" />
          <h3>System Modules</h3>
        </div>
        <div class="card-body">
          <div class="module-grid">
            <div v-for="(ver, name) in pingData.modules" :key="name" class="module-item">
              <span class="m-name">{{ name }}</span>
              <span class="m-ver">v{{ ver }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Section: Recovery -->
      <div class="settings-card danger-zone">
        <div class="card-header">
          <Icon name="undo" size="20" class="header-icon" />
          <h3>Troubleshooting</h3>
        </div>
        <div class="card-body">
          <p class="trouble-text">If data sync is inconsistent, a local reset will re-initialize the app cache.</p>
          <button class="reset-btn" @click="factoryReset">Reset Application Data</button>
        </div>
      </div>

      <div class="footer-info">
        <div class="brand">CLASH MANAGER V6.2.0</div>
        <div class="copy">Copyright © 2026 AlbiDR</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.view-container { min-height: 100vh; }
.settings-content { padding: 12px 0 120px; display: flex; flex-direction: column; gap: 16px; }

.settings-card {
  background: var(--sys-color-surface-container);
  border-radius: 24px;
  border: 1px solid var(--sys-surface-glass-border);
  overflow: hidden;
  animation: card-bloom 0.4s var(--sys-motion-spring) backwards;
  transition: background-color 0.3s ease;
}

.card-header {
  padding: 16px 20px;
  display: flex; align-items: center; gap: 12px;
  border-bottom: 1px solid rgba(0,0,0,0.05);
}
.card-header h3 { margin: 0; font-size: 16px; font-weight: 850; color: var(--sys-color-on-surface); }
.header-icon { color: var(--sys-color-primary); }

.card-body { padding: 20px; }

.network-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; }
.stat-box {
  background: var(--sys-color-surface-container-high);
  padding: 12px; border-radius: 16px;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
}
.stat-box .label { font-size: 10px; font-weight: 800; opacity: 0.6; text-transform: uppercase; }
.stat-box .value { font-size: 15px; font-weight: 900; font-family: var(--sys-font-family-mono); color: var(--sys-color-primary); }

.url-manager .field-label { font-size: 10px; font-weight: 800; opacity: 0.5; margin-bottom: 8px; }
.url-readout {
  background: var(--sys-color-surface-container-highest);
  padding: 10px 14px; border-radius: 12px;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
}
.url-text { font-family: var(--sys-font-family-mono); font-size: 12px; opacity: 0.7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.edit-btn { background: none; border: none; color: var(--sys-color-primary); font-weight: 800; font-size: 12px; cursor: pointer; }

.url-input-row { display: flex; gap: 8px; }
.glass-input { flex: 1; height: 40px; background: white; border: 1.5px solid var(--sys-color-primary); border-radius: 10px; padding: 0 12px; font-family: var(--sys-font-family-mono); font-size: 13px; }
.save-btn { width: 40px; border-radius: 10px; background: var(--sys-color-primary); color: white; border: none; }
.cancel-btn { width: 40px; border-radius: 10px; background: var(--sys-color-surface-container-highest); border: none; font-weight: 800; }

.override-pill { margin-top: 10px; padding: 8px; border-radius: 8px; background: var(--sys-color-error-container); color: var(--sys-color-on-error-container); font-size: 11px; font-weight: 800; text-align: center; cursor: pointer; }

/* THEME SWITCH */
.theme-switch {
  display: flex;
  background: var(--sys-color-surface-container-high);
  padding: 4px;
  border-radius: 99px;
  gap: 4px;
}
.theme-btn {
  flex: 1;
  height: 40px;
  border: none;
  background: transparent;
  color: var(--sys-color-outline);
  border-radius: 99px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.2s var(--sys-motion-spring);
}
.theme-btn.active {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  box-shadow: 0 4px 12px rgba(var(--sys-color-primary-rgb), 0.2);
}

.features-list { display: flex; flex-direction: column; gap: 16px; }
.toggle-row { display: flex; align-items: center; justify-content: space-between; cursor: pointer; }

.row-label { font-weight: 800; font-size: 15px; color: var(--sys-color-on-surface); }
.row-desc { font-size: 13px; opacity: 0.6; }

.switch { width: 44px; height: 24px; background: var(--sys-color-surface-container-highest); border-radius: 12px; position: relative; transition: 0.3s; border: 1.5px solid rgba(0,0,0,0.1); }
.switch.active { background: var(--sys-color-primary); }
.switch .handle { position: absolute; top: 2px; left: 2px; width: 17px; height: 17px; background: white; border-radius: 50%; transition: 0.3s; }
.switch.active .handle { left: calc(100% - 19px); }

.module-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1px; background: rgba(0,0,0,0.05); border-radius: 12px; overflow: hidden; }
.module-item { background: var(--sys-color-surface-container-high); padding: 12px; display: flex; flex-direction: column; gap: 2px; }
.m-name { font-size: 10px; font-weight: 800; opacity: 0.5; text-transform: uppercase; }
.m-ver { font-size: 14px; font-weight: 700; font-family: var(--sys-font-family-mono); color: var(--sys-color-primary); }

.danger-zone { border-color: rgba(var(--sys-color-error-rgb), 0.2); }
.trouble-text { font-size: 13px; opacity: 0.6; line-height: 1.5; margin-bottom: 16px; }
.reset-btn { width: 100%; height: 44px; border-radius: 12px; background: var(--sys-color-surface-container-highest); border: 1.5px solid rgba(0,0,0,0.05); font-weight: 800; font-size: 14px; color: var(--sys-color-on-surface); cursor: pointer; }

.install-banner {
  background: linear-gradient(135deg, var(--sys-color-primary), #6750a4);
  color: white; border-radius: 24px; padding: 20px; display: flex; align-items: center; gap: 16px; cursor: pointer;
  box-shadow: 0 10px 25px rgba(var(--sys-color-primary-rgb), 0.3);
}
.ib-text { flex: 1; }
.ib-title { font-weight: 900; font-size: 16px; letter-spacing: -0.01em; }
.ib-desc { font-size: 13px; opacity: 0.8; }

.footer-info { padding: 40px 0; text-align: center; }
.brand { font-size: 12px; font-weight: 900; opacity: 0.2; letter-spacing: 0.1em; }
.copy { font-size: 10px; opacity: 0.2; margin-top: 4px; }
</style>
