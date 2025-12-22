<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useApiState } from '../../composables/useApiState'
import Icon from '../Icon.vue'

const { apiUrl, apiStatus, pingData } = useApiState()
const newApiUrl = ref('')
const isEditing = ref(false)

const hasLocalOverride = computed(() => !!localStorage.getItem('cm_gas_url'))

watch(apiStatus, (newVal) => {
    if (newVal === 'unconfigured') isEditing.value = true
}, { immediate: true })

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
</script>

<template>
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
</template>

<style scoped>
/* Copied styles from SettingsView, simplified for component isolation if needed, 
   but for now we rely on the parent or global styles if they were global. 
   However, the original styles were scoped. I need to copy them here. */

.settings-card {
  background: var(--sys-color-surface-container);
  border-radius: 24px;
  border: 1px solid var(--sys-surface-glass-border);
  overflow: hidden;
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

.status-indicator {
    width: 8px; height: 8px; border-radius: 50%;
}
.status-indicator.online { background: #22c55e; box-shadow: 0 0 10px #22c55e66; }
.status-indicator.offline { background: #ef4444; }
.status-indicator.unconfigured { background: #f59e0b; animation: pulse 2s infinite; }
</style>
