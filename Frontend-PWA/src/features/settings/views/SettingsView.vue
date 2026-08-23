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
import { ConsoleLayout, SkeletonSettingsCard, SettingRow, EventManagement } from "@shared";
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
  layoutEvents,
  isSkeletonPreviewActive,
  toggleSkeletonPreview
} = useSettings();

const { isShowcaseMode } = useShowcaseMode();
</script>

<template>
  <!-- ignore-blueprint-mode: Settings hosts Blueprint Mode's own on/off
       toggle (ModeSettings.vue). Without this, enabling Blueprint replaces
       this view's real content with skeletons too, hiding the toggle that
       would turn it back off. -->
  <ConsoleLayout
    v-bind="layoutProps"
    :skeleton-component="SkeletonSettingsCard"
    ignore-blueprint-mode
    v-on="layoutEvents"
  >
    <!-- Rendered unconditionally by ConsoleLayout regardless of loading state -
         the one safe place for this toggle. Anywhere inside .settings-content
         below would hide itself the moment it's switched on, recreating the
         exact "Structural Blueprint" trap this exists to let people audit. -->
    <template #top>
      <SettingRow
        label="Preview Skeleton Layout"
        description="Temporarily show this screen's own loading skeleton to check it against the real layout"
        :active="isSkeletonPreviewActive"
        mini
        @click="toggleSkeletonPreview"
      />
    </template>

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
</style>
