<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { SettingRow, SettingsCard } from "@shared";
import { useSettings } from "../composables/useSettings";
defineProps<{
  initiallyExpanded?: boolean;
}>();

const {
  isSyntheticMode,
  toggleSyntheticMode,
  isBlueprintMode,
  toggleBlueprintMode,
  isShowcaseMode,
  toggleShowcaseMode,
  isRefreshing,
} = useSettings();
</script>

<template>
  <SettingsCard
    title="Display Preferences"
    icon="visibility"
    :loading="isRefreshing"
    :initially-expanded="initiallyExpanded"
  >
    <div class="setting-row-stack">
      <SettingRow
        label="Synthetic Engine"
        description="Populate the interface with high-fidelity mock data"
        :active="isSyntheticMode"
        :disabled="isShowcaseMode"
        mini
        @click="toggleSyntheticMode"
      />

      <!-- Blueprint Mode: intentionally NOT disabled by isShowcaseMode. Unlike
           Synthetic (which Showcase requires to stay on), Blueprint is documented
           as optional under Showcase (see useShowcaseMode.ts's "Skeletons are
           optional to allow for high-fidelity captures"). Disabling this row
           here previously trapped users: enabling Blueprint while Synthetic was
           already on auto-promoted to Showcase, which then disabled this very
           row via pointer-events, leaving no direct way to turn it back off. -->
      <SettingRow
        label="Structural Blueprint"
        description="Strip UI to geometric skeletons to audit layout stability"
        :active="isBlueprintMode"
        mini
        @click="toggleBlueprintMode"
      />

      <!-- Master Showcase Group -->
      <div
        class="mode-master-container"
        :class="{ active: isShowcaseMode }"
      >
        <SettingRow
          :active="isShowcaseMode"
          mini
          @click="toggleShowcaseMode"
        >
          <template #label>
            <div class="label-with-badge">
              Master Showcase
              <span
                v-if="isShowcaseMode"
                class="hybrid-badge"
              >HYBRID</span>
            </div>
          </template>
          <template #description>
            A curated fusion environment leveraging both synthetic data and
            structural skeletons
          </template>
        </SettingRow>
      </div>
    </div>
  </SettingsCard>
</template>

<style scoped>
/* Deliberately kept local rather than abstracted. Three flex properties do not warrant
   a shared component or a global class (ADR Section I: YAGNI, KISS), and the shared
   --sys-space-8 token already prevents the one value that matters from drifting against
   the identically-named stack in AppearanceSettings. The name is shared vocabulary; the
   declaration is not shared surface. */
.setting-row-stack {
  display: flex;
  flex-direction: column;
  gap: var(--sys-space-8);
}

.mode-master-container {
  border-radius: 8px;
  background: transparent;
  border: 1px solid transparent;
  transition:
    background 0.3s var(--sys-motion-spring),
    border-color 0.3s var(--sys-motion-spring),
    box-shadow 0.3s var(--sys-motion-spring);
}

.mode-master-container.active {
  background: var(--sys-color-primary-container);
  border-color: rgba(var(--sys-color-primary-rgb), 0.2);
  box-shadow: var(--sys-elevation-1);
}

.mode-master-container.active .toggle-row .row-label {
  color: var(--sys-color-on-primary-container) !important;
}

.mode-master-container.active .toggle-row .row-desc {
  color: var(--sys-color-on-primary-container) !important;
  opacity: 0.7;
}

.hybrid-badge {
  font-size: 9px;
  font-weight: 950;
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  padding: 2px 6px;
  border-radius: 99px;
  letter-spacing: 0.04em;
}

/* Replaces an anonymous `flex align-center gap-8` utility triplet that was declared
   locally in this component and, identically, in RecoverySettings (where it was never
   even used). A single semantic class states the intent and removes the duplicate
   declaration site. */
.label-with-badge {
  display: flex;
  align-items: center;
  gap: var(--sys-space-8);
}
</style>
