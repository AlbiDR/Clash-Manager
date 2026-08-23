<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->

<!-- [VR5] Plain script block: module-level export required by DataLoaderPlugin. -->
<script lang="ts">
import { defineBasicLoader } from "vue-router/experimental";
import { hydrateClashData } from "@core";

/**
 * COMPONENT: SettingsView.vue
 * ----------------------------------------------------------------------------
 * Rationale: Feature view orchestrator for user configuration and systems settings.
 * ----------------------------------------------------------------------------
 *
 * **Vue Router 5 Route Data Loader Contract:**
 * - Co-locates route-level data loaders using named exports for static loader discovery.
 * - Named export must adhere to the naming contract: `useClashDataLoader`.
 * - Loader options must declare `{ lazy: true }` to satisfy the Stale-While-Revalidate
 *   PWA topology, preventing blocking first paints while fresh payloads hydrate.
 *
 * @remarks Satisfies CleanStack ADR Section V: Route Data Loaders.
 */
export const useClashDataLoader = defineBasicLoader(hydrateClashData, { lazy: true });
</script>

<script setup lang="ts">
/**
 * Setup block for the Settings feature view.
 * Integrates global useSettings composition logic and manages settings sections.
 */
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
  AboutSettings,
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
    <!-- ModeSettings ("Display Preferences") lives here, in the one region
         ConsoleLayout renders unconditionally regardless of Blueprint Mode's
         forced skeleton swap of everything else below - it hosts Blueprint's
         own on/off toggle, so it must stay real and reachable no matter what
         state Blueprint is in. Enabling it and disabling it both go through
         the exact same card, the same way, every time. -->
    <template #top>
      <div class="mode-settings-wrapper">
        <ModeSettings :initially-expanded="isShowcaseMode" />
      </div>
    </template>

    <div class="settings-content">
      <EventManagement :initially-expanded="isShowcaseMode" />
      <AppearanceSettings :initially-expanded="isShowcaseMode" />
      <NotificationSettings :initially-expanded="isShowcaseMode" />
      <FeatureSettings :initially-expanded="isShowcaseMode" />
      <NetworkSettings :initially-expanded="isShowcaseMode" />
      <BackendRefresher v-if="modules.backendRefresher" :initially-expanded="isShowcaseMode" />
      <UsefulLinksSettings :initially-expanded="isShowcaseMode" />
      <RecoverySettings :initially-expanded="isShowcaseMode" />
      <AboutSettings :initially-expanded="isShowcaseMode" />
    </div>
  </ConsoleLayout>
</template>

<style scoped>
.settings-content {
  padding: 0 var(--sys-space-16);
  display: flex;
  flex-direction: column;
  gap: var(--sys-space-10);
}

.mode-settings-wrapper {
  padding: 0 var(--sys-space-16);
  margin-bottom: var(--sys-space-10);
}
</style>
