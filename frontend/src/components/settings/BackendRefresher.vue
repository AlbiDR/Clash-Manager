<script setup lang="ts">
import { ref } from 'vue'
import { triggerBackendUpdate } from '../../api/gasClient'
import Icon from '../Icon.vue'

const isRefreshing = ref(false)
const cooldown = ref(0)
const statusMessage = ref('Ready to update')

let cooldownTimer: number | null = null

const startCooldown = () => {
    cooldown.value = 60
    statusMessage.value = `Cooldown: ${cooldown.value}s`
    
    if (cooldownTimer) clearInterval(cooldownTimer)
    
    cooldownTimer = window.setInterval(() => {
        cooldown.value--
        if (cooldown.value <= 0) {
            if (cooldownTimer) clearInterval(cooldownTimer)
            cooldownTimer = null
            statusMessage.value = 'Ready to update'
        } else {
             statusMessage.value = `Cooldown: ${cooldown.value}s`
        }
    }, 1000)
}

const refresh = async () => {
    if (isRefreshing.value || cooldown.value > 0) return

    isRefreshing.value = true
    statusMessage.value = 'Requesting update...'

    try {
        const response = await triggerBackendUpdate()
        if (response.status === 'success') {
             // The backend trigger succeeded (the tickbox was checked)
             // We start the cooldown now.
             startCooldown()
        } else {
            statusMessage.value = 'Update failed'
            // Still cooldown on failure to prevent spam
             startCooldown()
        }
    } catch (e) {
        console.error('Backend refresh failed', e)
        statusMessage.value = 'Connection error'
         startCooldown()
    } finally {
        isRefreshing.value = false
    }
}

// Clean up timer
import { onUnmounted } from 'vue'
onUnmounted(() => {
    if (cooldownTimer) clearInterval(cooldownTimer)
})
</script>

<template>
    <div class="settings-card">
        <div class="card-header">
            <Icon name="refresh" size="20" class="header-icon" />
            <h3>Backend Refresh</h3>
        </div>
        <div class="card-body">
            <div class="refresh-content">
                <div class="info-text">
                    <p class="main-desc">Trigger a manual update of the backend spreadsheet.</p>
                    <p class="sub-desc">This ticks the hidden "mobile feature" checkboxes in A1 to force a sheet recalculation.</p>
                </div>
                
                <div class="action-area">
                    <div class="status-indicator" :class="{ active: isRefreshing, cooldown: cooldown > 0 }">
                        {{ statusMessage }}
                    </div>
                    <button 
                        class="refresh-btn" 
                        @click="refresh" 
                        :disabled="isRefreshing || cooldown > 0"
                        :class="{ processing: isRefreshing }"
                    >
                        <Icon v-if="!isRefreshing" name="refresh" size="18" />
                        <div v-else class="spinner"></div>
                        <span>{{ isRefreshing ? 'UPDATING' : 'REFRESH' }}</span>
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.settings-card {
  background: var(--sys-color-surface-container);
  border-radius: 24px;
  border: 1px solid var(--sys-surface-glass-border);
  overflow: hidden;
}

.card-header {
  padding: 16px 20px;
  display: flex; align-items: center; gap: 12px;
  border-bottom: 1px solid rgba(0,0,0,0.05);
}
.card-header h3 { margin: 0; font-size: 16px; font-weight: 850; color: var(--sys-color-on-surface); }
.header-icon { color: var(--sys-color-primary); }

.card-body { padding: 20px; }

.refresh-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
}

.info-text { flex: 1; }
.main-desc { font-weight: 700; font-size: 15px; color: var(--sys-color-on-surface); margin: 0 0 4px 0; }
.sub-desc { font-size: 13px; opacity: 0.6; margin: 0; line-height: 1.4; }

.action-area {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
}

.status-indicator {
    font-size: 11px;
    font-weight: 700;
    opacity: 0.5;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    transition: color 0.3s;
}
.status-indicator.active { color: var(--sys-color-primary); opacity: 1; }
.status-indicator.cooldown { color: var(--sys-color-tertiary); opacity: 1; }

.refresh-btn {
    display: flex; align-items: center; gap: 8px;
    background: var(--sys-color-primary);
    color: var(--sys-color-on-primary);
    border: none;
    padding: 10px 20px;
    border-radius: 12px;
    font-weight: 800;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 120px;
    justify-content: center;
}

.refresh-btn:hover:not(:disabled) {
    background: var(--sys-color-primary-container);
    color: var(--sys-color-on-primary-container);
    transform: translateY(-1px);
}

.refresh-btn:active:not(:disabled) {
    transform: scale(0.98);
}

.refresh-btn:disabled {
    background: var(--sys-color-surface-container-highest);
    color: var(--sys-color-on-surface-variant);
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
}

.spinner {
    width: 18px; height: 18px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

@media (max-width: 600px) {
    .refresh-content { flex-direction: column; align-items: flex-start; }
    .action-area { width: 100%; align-items: center; margin-top: 12px; }
    .refresh-btn { width: 100%; }
}
</style>
