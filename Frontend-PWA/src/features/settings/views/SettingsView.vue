<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { ConsoleLayout, SkeletonSettingsCard } from "@shared";
import { useSettings } from "../composables";
import { useShowcaseMode } from "@core/services/useShowcaseMode";
import { defineAsyncComponent } from "vue";

// Settings Components
import {
  AppearanceSettings,
  NotificationSettings,
  FeatureSettings,
  ModeSettings,
  NetworkSettings,
  BackendRefresher,
  RecoverySettings,
} from "../components";

const EventManagement = defineAsyncComponent(() => import("../../voyage/components/EventManagement.vue"));

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
      <EventManagement :initially-expanded="isShowcaseMode" />
      <AppearanceSettings :initially-expanded="isShowcaseMode" />
      <NotificationSettings :initially-expanded="isShowcaseMode" />
      <FeatureSettings :initially-expanded="isShowcaseMode" />
      <ModeSettings :initially-expanded="isShowcaseMode" />
      <NetworkSettings :initially-expanded="isShowcaseMode" />
      <BackendRefresher v-if="modules.backendRefresher" :initially-expanded="isShowcaseMode" />
      <RecoverySettings :initially-expanded="isShowcaseMode" />
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
