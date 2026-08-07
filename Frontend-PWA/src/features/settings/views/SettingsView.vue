<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->

<!-- [VR5] Plain script block: module-level export required by DataLoaderPlugin. -->
<script lang="ts">
import { defineBasicLoader } from "vue-router/experimental";
import { hydrateClashData } from "@core";

/**
 * Route data loader - exported so the DataLoaderPlugin can discover it.
 * Wraps `hydrateClashData` (L1) with the Vue Router 5 loader contract.
 */
export const useClashDataLoader = defineBasicLoader(hydrateClashData, { lazy: true });
</script>

<script setup lang="ts">
import { ConsoleLayout, SkeletonSettingsCard, EventManagement } from "@shared";
import { useSettings } from "../composables";
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
  UsefulLinksSettings,
} from "../components";

useClashDataLoader();

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
      <UsefulLinksSettings :initially-expanded="isShowcaseMode" />
      <RecoverySettings :initially-expanded="isShowcaseMode" />
    </div>
  </ConsoleLayout>
</template>

<style scoped>
.settings-content {
  padding: 0 var(--sys-space-16);
  display: flex;
  flex-direction: column;
  gap: var(--sys-space-12);
}
</style>
