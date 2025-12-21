<script setup lang="ts">
import { useInstallPrompt } from '../../composables/useInstallPrompt'
import Icon from '../Icon.vue'

const { isInstallable, install } = useInstallPrompt()
</script>

<template>
    <div v-if="isInstallable" class="install-banner" @click="install">
        <Icon name="download" size="24" />
        <div class="ib-text">
            <div class="ib-title">Install PWA</div>
            <div class="ib-desc">Unlock full native features and speed</div>
        </div>
        <Icon name="chevron_right" size="20" class="arrow" />
    </div>
</template>

<style scoped>
.install-banner {
  background: linear-gradient(135deg, var(--sys-color-primary), #6750a4);
  color: white; border-radius: 24px; padding: 20px; display: flex; align-items: center; gap: 16px; cursor: pointer;
  box-shadow: 0 10px 25px rgba(var(--sys-color-primary-rgb), 0.3);
}
.ib-text { flex: 1; }
.ib-title { font-weight: 900; font-size: 16px; letter-spacing: -0.01em; }
.ib-desc { font-size: 13px; opacity: 0.8; }
</style>
