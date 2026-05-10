<script setup lang="ts">
import { ConsoleLayout } from "@shared";
import { useSettings } from "../composables/useSettings";
import { useShowcaseMode } from "@core/services/useShowcaseMode";

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

const { isShowcaseMode } = useShowcaseMode();
</script>

<template>
  <ConsoleLayout
    v-bind="layoutProps"
    :skeleton-component="SkeletonSettingsCard"
    v-on="layoutEvents"
  >
    <div class="settings-content">
      <AppearanceSettings :initially-expanded="isShowcaseMode" />
      <NotificationSettings />
      <FeatureSettings :initially-expanded="isShowcaseMode" />
      <ModeSettings />
      <NetworkSettings :initially-expanded="isShowcaseMode" />
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
