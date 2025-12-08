<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { isConfigured, getApiUrl, ping } from '../api/gasClient'
import type { PingResponse } from '../types'
import { appSettings, setModuleEnabled } from '../stores/appSettings'

const apiUrl = ref('')
const apiConfigured = ref(false)
const apiStatus = ref<'checking' | 'online' | 'offline'>('checking')
const pingData = ref<PingResponse | null>(null)

const warLogEnabled = computed({
  get: () => appSettings.modules.warLog,
  set: (value: boolean) => setModuleEnabled('warLog', value)
})

onMounted(async () => {
  apiUrl.value = getApiUrl()
  apiConfigured.value = isConfigured()
  
  if (apiConfigured.value) {
    try {
      const response = await ping()
      if (response.status === 'success' && response.data) {
        apiStatus.value = 'online'
        pingData.value = response.data
      } else {
        apiStatus.value = 'offline'
      }
    } catch {
      apiStatus.value = 'offline'
    }
  }
})
</script>

<template>
  <div class="settings-view">
    <header class="settings-header">
      <h1 class="page-title">Settings</h1>
    </header>
    
    <!-- Modules Section -->
    <section class="settings-card">
      <div class="card-header">
        <span class="card-icon">🧩</span>
        <h2 class="card-title">Modules</h2>
      </div>
      
      <div class="toggle-item">
        <div class="toggle-info">
          <span class="toggle-label">War Log</span>
          <span class="toggle-desc">Track clan war history and performance</span>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" v-model="warLogEnabled" />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </section>
    
    <!-- API Configuration -->
    <section class="settings-card">
      <div class="card-header">
        <span class="card-icon">🔌</span>
        <h2 class="card-title">API Configuration</h2>
      </div>
      
      <div class="info-row">
        <span class="info-label">Status</span>
        <div class="status-display">
          <span 
            class="status-dot"
            :class="{
              'online': apiStatus === 'online',
              'offline': apiStatus === 'offline',
              'checking': apiStatus === 'checking'
            }"
          ></span>
          <span class="status-text">
            {{ apiStatus === 'online' ? 'Connected' : apiStatus === 'offline' ? 'Disconnected' : 'Checking...' }}
          </span>
        </div>
      </div>
      
      <div class="info-row">
        <span class="info-label">Endpoint</span>
        <code class="endpoint-url">{{ apiUrl }}</code>
      </div>
      
      <div class="info-row" v-if="pingData">
        <span class="info-label">Version</span>
        <span class="info-value">{{ pingData.version }}</span>
      </div>
    </section>
    
    <!-- About Section -->
    <section class="settings-card about-card">
      <div class="about-content">
        <div class="app-icon">👑</div>
        <h3 class="app-name">Clash Royale Manager</h3>
        <p class="app-version">v1.0.0</p>
        <p class="app-desc">
          A modern PWA for managing your Clash Royale clan. Built with Vue 3 + TypeScript.
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.settings-view {
  min-height: 100vh;
  padding-bottom: 120px;
}

.settings-header {
  padding: 16px 0 8px;
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--sys-color-on-surface);
  margin: 0;
  letter-spacing: -0.5px;
}

.settings-card {
  background: var(--sys-color-surface-container-low);
  border-radius: var(--shape-corner-l);
  padding: 20px;
  margin-bottom: 16px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.card-icon {
  font-size: 20px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--sys-color-on-surface);
  margin: 0;
}

.toggle-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
}

.toggle-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.toggle-label {
  font-size: 15px;
  font-weight: 600;
  color: var(--sys-color-on-surface);
}

.toggle-desc {
  font-size: 13px;
  color: var(--sys-color-on-surface-variant);
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 52px;
  height: 32px;
  flex-shrink: 0;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--sys-color-surface-variant);
  transition: all 0.3s var(--sys-motion-spring);
  border-radius: var(--shape-corner-full);
}

.toggle-slider:before {
  position: absolute;
  content: "";
  height: 24px;
  width: 24px;
  left: 4px;
  bottom: 4px;
  background-color: var(--sys-color-on-surface-variant);
  transition: all 0.3s var(--sys-motion-spring);
  border-radius: 50%;
}

.toggle-switch input:checked + .toggle-slider {
  background-color: var(--sys-color-primary);
}

.toggle-switch input:checked + .toggle-slider:before {
  transform: translateX(20px);
  background-color: var(--sys-color-on-primary);
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--sys-color-outline-variant);
}

.info-row:last-child {
  border-bottom: none;
}

.info-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--sys-color-on-surface-variant);
}

.info-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--sys-color-on-surface);
}

.status-display {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.status-dot.online {
  background: var(--sys-color-success);
  box-shadow: 0 0 8px var(--sys-color-success);
}

.status-dot.offline {
  background: var(--sys-color-error);
}

.status-dot.checking {
  background: var(--sys-color-tertiary);
  animation: pulse 1.5s infinite;
}

.status-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--sys-color-on-surface);
}

.endpoint-url {
  font-size: 12px;
  padding: 6px 10px;
  background: var(--sys-color-surface-container-high);
  border-radius: var(--shape-corner-s);
  color: var(--sys-color-on-surface-variant);
  word-break: break-all;
  max-width: 200px;
  text-align: right;
}

.about-card {
  text-align: center;
}

.about-content {
  padding: 20px 0;
}

.app-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.app-name {
  font-size: 20px;
  font-weight: 700;
  color: var(--sys-color-on-surface);
  margin: 0 0 4px;
}

.app-version {
  font-size: 13px;
  color: var(--sys-color-on-surface-variant);
  margin: 0 0 16px;
}

.app-desc {
  font-size: 14px;
  color: var(--sys-color-on-surface-variant);
  line-height: 1.5;
  margin: 0;
  max-width: 280px;
  margin: 0 auto;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>
