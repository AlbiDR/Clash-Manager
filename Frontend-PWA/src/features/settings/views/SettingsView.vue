<script setup lang="ts">
import {
  vTactile,
  ConsoleLayout
} from "@shared";
import { useSettings } from "../composables/useSettings";

// Settings Components
import NetworkSettings from "../components/NetworkSettings.vue";
import BackendRefresher from "../components/BackendRefresher.vue";
import NotificationSettings from "../components/NotificationSettings.vue";
import AppearanceSettings from "../components/AppearanceSettings.vue";
import FeatureSettings from "../components/FeatureSettings.vue";
import ModeSettings from "../components/ModeSettings.vue";
import RecoverySettings from "../components/RecoverySettings.vue";
import SkeletonSettingsCard from "../components/SkeletonSettingsCard.vue";


const {
  apiStatusObject,
  isRefreshing,
  isHydrated,
  refresh,
  appVersion,
  footerBadgeText,
  modules,
  haptics,
} = useSettings();
</script>

<template>
  <ConsoleLayout
    title="Settings"
    :status="apiStatusObject"
    :loading="!isHydrated"
    :is-refreshing="isRefreshing"
    sheet-url="https://script.google.com/u/0/home/projects/1Filr0HnIaN3dJENeZ7KtU4enHaCNH1LqcztujRwFQ7_RTZVJ7VY5K9zH"
    :skeleton-component="SkeletonSettingsCard"
    @refresh="refresh()"
  >
    <div class="settings-content">
      <AppearanceSettings :initially-expanded="true" />
      <NotificationSettings />
      <FeatureSettings :initially-expanded="true" />
      <ModeSettings />
      <NetworkSettings />
      <BackendRefresher v-if="modules.backendRefresher" />
      <RecoverySettings />

      <div class="footer-info">
        <div
          class="brand"
          @click="
            haptics.heavy();
            window.location.reload();
          "
          v-tactile
        >
          CLASH MANAGER V{{ appVersion }}
          <span v-if="footerBadgeText" class="demo-tag">{{ footerBadgeText }}</span>
        </div>
        <div class="copy">Copyright © 2026 AlbiDR</div>
      </div>
    </div>
  </ConsoleLayout>
</template>

<style scoped>
.settings-content {
  padding: 0 16px; /* Standard horizontal inner padding */
  display: flex;
  flex-direction: column;
  gap: 12px; /* Uniform card spacing */
}

.footer-info {
  padding: 40px 0;
  text-align: center;
  user-select: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.brand {
  font-size: 12px;
  font-weight: 950;
  opacity: 0.3;
  letter-spacing: 0.1em;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: opacity 0.2s;
}
.brand:active {
  opacity: 0.6;
}

.demo-tag {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  font-size: 8px;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0;
  opacity: 1;
}

.copy {
  font-size: 10px;
  opacity: 0.2;
}
</style>
