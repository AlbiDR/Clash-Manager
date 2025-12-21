<script setup lang="ts">
import Icon from '../Icon.vue'

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
</script>

<template>
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
</template>

<style scoped>
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

.danger-zone { border-color: rgba(var(--sys-color-error-rgb), 0.2); }
.trouble-text { font-size: 13px; opacity: 0.6; line-height: 1.5; margin-bottom: 16px; }
.reset-btn { width: 100%; height: 44px; border-radius: 12px; background: var(--sys-color-surface-container-highest); border: 1.5px solid rgba(0,0,0,0.05); font-weight: 800; font-size: 14px; color: var(--sys-color-on-surface); cursor: pointer; }
</style>
