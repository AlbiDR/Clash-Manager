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
  SettingsSkeleton,
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
    :skeleton-component="SettingsSkeleton"
    :skeleton-count="1"
    class="settings-console"
    ignore-blueprint-mode
    v-on="layoutEvents"
  >
    <div class="settings-content">
      <!-- LIVE: what the clan is doing right now. Kept first, unlabelled and
           visually separated, because it is the only card whose contents change
           on their own. -->
      <section class="settings-group">
        <template v-if="isBlueprintMode">
          <SkeletonSettingsCard :index="0" />
        </template>
        <EventManagement v-else />
      </section>

      <section class="settings-group">
        <h2 class="group-label label-section">
          Preferences
        </h2>

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
      </section>

      <section class="settings-group">
        <h2 class="group-label label-section">
          System
        </h2>

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
      </section>
    </div>
  </ConsoleLayout>
</template>

<style scoped>
/* ConsoleLayout renders the loading skeletons in its own container, which
   cannot see `.settings-content` below. Declaring this view's geometry as two
   inherited custom properties gives both lists one source, so the column no
   longer slides sideways and re-spaces itself as it hydrates. */
.settings-console {
  --console-gutter: var(--sys-space-16);
  --console-gap: var(--sys-space-10);
  --console-group-gap: var(--sys-space-20);
}

.settings-content {
  padding: 0 var(--console-gutter);
  display: flex;
  flex-direction: column;
  gap: var(--console-group-gap);
}

.settings-group {
  display: flex;
  flex-direction: column;
  gap: var(--console-gap);
}

/* [DECISION LOG] THREE TIERS, NOT NINE PEERS:
   Every card used to sit at one flat level, all collapsed, so a Clan Voyage
   running right now carried exactly the weight of Factory Reset. The live card
   leads and is deliberately unlabelled, because a heading over a single card
   is noise; the two headings below separate what a person changes by
   preference from what belongs to the machine. */
.group-label {
  margin: var(--sys-space-4) 0 var(--sys-space-2) var(--sys-space-4);
  /* Pinned so the heading occupies exactly one typescale step. The inherited
     1.5 reset made it 15px against the 10px its placeholder reserved, which is
     a 5px shift per heading at hydration. Both sides now resolve through the
     same two tokens. */
  line-height: var(--sys-leading-none);
  color: var(--sys-color-on-surface-variant);
}
</style>
