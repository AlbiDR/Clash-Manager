<script setup lang="ts">
import SettingsCard from '../SettingsCard.vue'

function factoryReset() {
    if (confirm('Reset Application Data?\\n\\nThis will clear local cache and settings. Data on the Google Sheet will NOT be affected.')) {
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
    <SettingsCard title="Troubleshooting" icon="undo">
        <p class="trouble-text">If data sync is inconsistent, a local reset will re-initialize the app cache.</p>
        <button class="reset-btn" @click="factoryReset">Reset Application Data</button>
    </SettingsCard>
</template>

<style scoped>
.trouble-text { font-size: 13px; opacity: 0.6; line-height: 1.5; margin-bottom: 16px; }
.reset-btn { width: 100%; height: 44px; border-radius: 12px; background: var(--sys-color-surface-container-highest); border: 1.5px solid rgba(0,0,0,0.05); font-weight: 800; font-size: 14px; color: var(--sys-color-on-surface); cursor: pointer; }
</style>
