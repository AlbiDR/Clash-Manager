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
import { SettingRow, SettingsCard, vTactile } from "@shared";
import { useNativeBridge } from "@core/services/useNativeBridge";
import { useSettings } from "../composables/useSettings";
import AndroidCalibrationSettings from "./AndroidCalibrationSettings.vue";

defineProps<{
  /** Indicates whether the application features collapsible card should start expanded. */
  initiallyExpanded?: boolean;
}>();

const { modules, toggle, isRefreshing, setBlitzSpeed } = useSettings();
const { isNativeWrapper, openAccessibilitySettings } = useNativeBridge();

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

      <!-- Blitz Speed Selector -->
      <div v-if="modules.blitzMode" class="blitz-speed-section">
        <div class="speed-label">Blitz Speed</div>

        <div
          class="speed-selector"
          role="group"
          aria-label="Blitz Interaction Speed"
        >
          <button
            v-tactile
            v-for="speedValue in (['fast', 'medium', 'slow'] as const)"
            :key="speedValue"
            :class="{ active: modules.blitzSpeed === speedValue }"
            @click="setBlitzSpeed(speedValue)"
            class="speed-btn"
            :aria-label="`Set blitz speed to ${speedValue}`"
            :aria-pressed="modules.blitzSpeed === speedValue"
          >
            {{ speedValue }}
          </button>
        </div>
      </div>
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

/* ── Blitz Speed Section ── */
.blitz-speed-section {
  display: flex;
  align-items: center;
  gap: var(--sys-space-10);
  padding: 2px 0 4px;
}

.speed-label {
  flex: 0 0 auto;
  font-size: var(--sys-typescale-body-sm);
  font-weight: 700;
  color: var(--sys-color-on-surface);
  white-space: nowrap;
}

.speed-selector {
  flex: 1;
  min-width: 0;
  display: flex;
  background: var(--sys-color-surface-container-high);
  padding: 4px;
  border-radius: 8px;
  gap: 4px;
  width: 100%;
}

.speed-btn {
  flex: 1;
  min-width: 0;
  height: 48px; /* 48px touch target compliance */
  padding: 0 8px;
  border: none;
  background: transparent;
  color: var(--sys-color-outline);
  border-radius: 6px;
  font-weight: 800;
  font-size: 13px;
  text-transform: capitalize;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s var(--sys-motion-spring);
}

.speed-btn.active {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  box-shadow: 0 4px 12px rgba(var(--sys-color-primary-rgb), 0.25);
  transform: scale(1.02);
}

.speed-btn:hover:not(.active) {
  background: rgba(var(--sys-color-primary-rgb), 0.08);
  color: var(--sys-color-on-surface);
}

.speed-btn:active {
  transform: scale(0.96);
}

@media (max-width: 380px) {
  .blitz-speed-section {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
