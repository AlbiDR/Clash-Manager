<script setup lang="ts">
import { useInstallPrompt } from '../../composables/useInstallPrompt'
import { useHaptics } from '../../composables/useHaptics'
import Icon from '../Icon.vue'

const { isInstallable, install } = useInstallPrompt()
const haptics = useHaptics()

const handleInstall = async () => {
    haptics.tap()
    await install()
}
</script>

<template>
    <div v-if="isInstallable" class="install-banner" @click="handleInstall">
        <div class="ib-icon-wrapper">
            <Icon name="download" size="24" />
        </div>
        <div class="ib-text">
            <div class="ib-title">Install for Native Speed</div>
            <div class="ib-desc">Get shortcuts, badges & offline stability</div>
        </div>
        <Icon name="chevron_right" size="20" class="arrow" />
    </div>
</template>

<style scoped>
.install-banner {
  background: linear-gradient(135deg, var(--sys-color-primary), #6750a4);
  color: white; border-radius: 24px; padding: 20px; display: flex; align-items: center; gap: 16px; cursor: pointer;
  box-shadow: 0 10px 25px rgba(var(--sys-color-primary-rgb), 0.3);
  transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.install-banner:active { transform: scale(0.96); }
.ib-icon-wrapper {
  width: 48px; height: 48px; background: rgba(255, 255, 255, 0.2);
  border-radius: 14px; display: flex; align-items: center; justify-content: center;
}
.ib-text { flex: 1; }
.ib-title { font-weight: 900; font-size: 16px; letter-spacing: -0.01em; }
.ib-desc { font-size: 13px; opacity: 0.8; }
</style>
