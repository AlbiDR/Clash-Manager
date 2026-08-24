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
import { useBlueprintMode } from "@core/services/useBlueprintMode";

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
const { isBlueprintMode } = useBlueprintMode();
</script>

<template>
  <!-- ignore-blueprint-mode: ConsoleLayout's built-in Blueprint swap is
       all-or-nothing (the whole slot becomes skeletons, or none of it does).
       ModeSettings hosts Blueprint's own on/off toggle and must stay real, in
       its normal position, no matter what - so this view does its own
       per-card swap below instead, keeping every card in its original order. -->
  <ConsoleLayout
    v-bind="layoutProps"
    :skeleton-component="SkeletonSettingsCard"
    ignore-blueprint-mode
    v-on="layoutEvents"
  >
    <div class="settings-content">
      <template v-if="isBlueprintMode">
        <SkeletonSettingsCard :index="0" />
      </template>
      <EventManagement
        v-else
        :initially-expanded="isShowcaseMode"
      />

      <template v-if="isBlueprintMode">
        <SkeletonSettingsCard :index="1" />
      </template>
      <AppearanceSettings
        v-else
        :initially-expanded="isShowcaseMode"
      />

      <template v-if="isBlueprintMode">
        <SkeletonSettingsCard :index="2" />
      </template>
      <NotificationSettings
        v-else
        :initially-expanded="isShowcaseMode"
      />

      <template v-if="isBlueprintMode">
        <SkeletonSettingsCard :index="3" />
      </template>
      <FeatureSettings
        v-else
        :initially-expanded="isShowcaseMode"
      />

      <!-- Always real, in its normal position - see the ignore-blueprint-mode
           note above. -->
      <ModeSettings :initially-expanded="isShowcaseMode" />

      <template v-if="isBlueprintMode">
        <SkeletonSettingsCard :index="4" />
      </template>
      <NetworkSettings
        v-else
        :initially-expanded="isShowcaseMode"
      />

      <template v-if="modules.backendRefresher">
        <template v-if="isBlueprintMode">
          <SkeletonSettingsCard :index="5" />
        </template>
        <BackendRefresher
          v-else
          :initially-expanded="isShowcaseMode"
        />
      </template>

      <template v-if="isBlueprintMode">
        <SkeletonSettingsCard :index="6" />
      </template>
      <UsefulLinksSettings
        v-else
        :initially-expanded="isShowcaseMode"
      />

      <template v-if="isBlueprintMode">
        <SkeletonSettingsCard :index="7" />
      </template>
      <RecoverySettings
        v-else
        :initially-expanded="isShowcaseMode"
      />

      <template v-if="isBlueprintMode">
        <SkeletonSettingsCard :index="8" />
      </template>
      <AboutSettings
        v-else
        :initially-expanded="isShowcaseMode"
      />
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
