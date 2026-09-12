<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
/**
 * COMPONENT: FeatureSettings.vue
 * ----------------------------------------------------------------------------
 * Rationale: Application Features settings card. Controls benchmarking, sorting, and Blitz Mode.
 * ----------------------------------------------------------------------------
 *
 * **Decision Log - Native Wrapper & Blitz Mode Delegation:**
 * - Blitz Mode acts as an automated operation bypass.
 * - In native Android wrappers, the actual click automation is fully delegated to the native
 *   foreground accessibility service after the user enables the feature.
 * - Selecting Blitz Mode triggers an explicit redirection sequence to the system Accessibility
 *   settings on activation if not already granted.
 * - Interactive elements (such as Blitz Speed buttons) are scaled to `48px` to guarantee physical
 *   touch target compliance (`Target B.2`) in high-density mobile displays.
 *
 * @remarks Satisfies CleanStack ADR Section II: Unitary Architecture & Section IV: Hardware/Browser Brokering.
 */
import { computed } from "vue";
import { PrecisionSlider, SettingRow, SettingsCard } from "@shared";
import {
  BLITZ_BATCH_SHIFT_DELAY,
  BLITZ_DWELL_DETENTS,
  BLITZ_DWELL_MAX,
  BLITZ_DWELL_MIN,
  BLITZ_DWELL_STEP,
  formatCompactDuration,
} from "@core";
import { useNativeBridge } from "@core/services/useNativeBridge";
import { useSettings } from "../composables/useSettings";
import AndroidCalibrationSettings from "./AndroidCalibrationSettings.vue";

defineProps<{
  /** Indicates whether the application features collapsible card should start expanded. */
  initiallyExpanded?: boolean;
}>();

const { modules, toggle, isRefreshing, rosterSize, setBlitzDwell } = useSettings();
const { isNativeWrapper, openAccessibilitySettings } = useNativeBridge();

/**
 * Qualifier naming the population the run estimate is calculated over.
 *
 * @remarks
 * Empty until the roster has hydrated, which also suppresses the estimate.
 */
const blitzRunChip = computed(() =>
  rosterSize.value > 0 ? `${rosterSize.value} members` : "",
);

/**
 * Plain-language cost of the selected dwell time.
 *
 * @remarks
 * [DECISION LOG] A dwell time in milliseconds is a number few operators have
 * intuition for; the length of a full run is the decision actually being made.
 * Both the per-profile dwell and the inter-item shift are real pipeline
 * constants, and the population is the live roster, so the estimate carries no
 * invented figures.
 */
const blitzRunEstimate = computed(() => {
  if (rosterSize.value === 0) return "";
  const runMs = (modules.blitzDwellMs + BLITZ_BATCH_SHIFT_DELAY) * rosterSize.value;
  return `a full run takes about ${formatCompactDuration(runMs)}`;
});

/**
 * Handles the Blitz Mode toggle in non-native-wrapper (PWA) mode.
 *
 * @remarks
 * Prompts immediate redirection to the OS Accessibility settings to configure
 * click automation privileges if enabling Blitz Mode.
 */
function handleBlitzToggle() {
  const wasEnabled = !!modules.blitzMode;
  toggle("blitzMode");

  // [DECISION LOG] Only redirect to accessibility activation when the setting is being enabled
  // to avoid user disruption when disabling the feature.
  if (!wasEnabled) {
    openAccessibilitySettings();
  }
}
</script>

<template>
  <SettingsCard
    title="Application Features"
    icon="analytics"
    :loading="isRefreshing"
    :initially-expanded="initiallyExpanded"
  >
    <div class="feature-controls">
      <SettingRow
        label="Ghost Benchmarking"
        description="Clan averages in stat tooltips"
        :active="modules.ghostBenchmarking"
        :loading="isRefreshing"
        mini
        @click="toggle('ghostBenchmarking')"
      />

      <SettingRow
        label="Sorting Descriptions"
        description="Sorting logic labels"
        :active="modules.sortExplanation"
        :loading="isRefreshing"
        mini
        @click="toggle('sortExplanation')"
      />

      <SettingRow
        label="Blitz Mode"
        :description="isNativeWrapper ? 'Native foreground service' : 'Batch operations'"
        :active="modules.blitzMode"
        :loading="isRefreshing"
        mini
        @click="handleBlitzToggle()"
      />

      <!-- Blitz Dwell Time -->
      <PrecisionSlider
        v-if="modules.blitzMode"
        :model-value="modules.blitzDwellMs"
        label="Profile dwell time"
        unit="MS"
        :min="BLITZ_DWELL_MIN"
        :max="BLITZ_DWELL_MAX"
        :step="BLITZ_DWELL_STEP"
        scale="log"
        :detents="BLITZ_DWELL_DETENTS"
        show-bounds
        :consequence="blitzRunEstimate"
        :consequence-chip="blitzRunChip"
        @update:model-value="setBlitzDwell"
      />
    </div>

    <!-- Delegate Android Permissions and Calibration to AndroidCalibrationSettings -->
    <AndroidCalibrationSettings v-if="isNativeWrapper" />
  </SettingsCard>
</template>

<style scoped>
.feature-controls {
  display: flex;
  flex-direction: column;
  gap: var(--sys-space-8);
}

</style>
