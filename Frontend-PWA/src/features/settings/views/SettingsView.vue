<script setup lang="ts">
import { ConsoleLayout } from "@shared";
import { useSettings } from "../composables/useSettings";

// Settings Components
import {
  AppearanceSettings,
  NotificationSettings,
  FeatureSettings,
  ModeSettings,
  NetworkSettings,
  BackendRefresher,
  RecoverySettings,
  SkeletonSettingsCard
} from "../components";

const {
  modules,
  layoutProps,
  layoutEvents
} = useSettings();
</script>

<template>
  <ConsoleLayout
    v-bind="layoutProps"
    :skeleton-component="SkeletonSettingsCard"
    v-on="layoutEvents"
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
