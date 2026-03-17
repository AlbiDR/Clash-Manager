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
  footerBadgeText,
  modules,
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
    :footer-badge="footerBadgeText"
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

</style>
