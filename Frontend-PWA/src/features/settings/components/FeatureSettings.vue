<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { SettingRow, SettingsCard, vTactile } from "@shared";
import { useNativeBridge } from "@core/services/useNativeBridge";
import { useSettings } from "../composables/useSettings";
import AndroidCalibrationSettings from "./AndroidCalibrationSettings.vue";

defineProps<{
  initiallyExpanded?: boolean;
}>();

const { modules, toggle, isRefreshing, setBlitzSpeed } = useSettings();
const { isNativeWrapper, openAccessibilitySettings } = useNativeBridge();

/**
 * Handles the Blitz Mode toggle in non-native-wrapper (PWA) mode.
 */
function handleBlitzToggle() {
  const wasEnabled = !!modules.blitzMode;
  toggle("blitzMode");

  // Only redirect to accessibility activation when the setting is being enabled
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
    <div class="features-list">
      <SettingRow
        label="Ghost Benchmarking"
        description="Visualize clan averages inside stat tooltips"
        :active="modules.ghostBenchmarking"
        :loading="isRefreshing"
        @click="toggle('ghostBenchmarking')"
      />

      <SettingRow
        label="Sorting Descriptions"
        description="Explain the logic behind sorting heuristics"
        :active="modules.sortExplanation"
        :loading="isRefreshing"
        @click="toggle('sortExplanation')"
      />

      <!-- On the native Android wrapper, Blitz Mode is always hardware-delegated via JSBridge.
           The manual toggle has no effect in this context. -->
      <SettingRow
        label="Blitz Mode"
        :description="isNativeWrapper ? 'Delegated to native foreground service' : 'Batch operations without confirmation'"
        :active="modules.blitzMode"
        :loading="isRefreshing"
        @click="handleBlitzToggle()"
      />

      <!-- Blitz Speed Selector -->
      <div v-if="modules.blitzMode || isNativeWrapper" class="blitz-speed-section">
        <div class="speed-header">
          <div class="speed-label">Blitz Speed</div>
          <div class="speed-desc">Touch target interaction rate</div>
        </div>

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
.features-list {
  display: flex;
  flex-direction: column;
  gap: var(--sys-space-16);
}

/* ── Blitz Speed Section ── */
.blitz-speed-section {
  display: flex;
  flex-direction: column;
  gap: var(--sys-space-12);
  padding: var(--sys-space-4) 0;
}

.speed-header {
  display: flex;
  flex-direction: column;
  gap: var(--sys-space-2);
}

.speed-label {
  font-size: var(--sys-typescale-body-sm);
  font-weight: 600;
  color: var(--sys-color-on-surface);
}

.speed-desc {
  font-size: var(--sys-typescale-meta);
  color: var(--sys-color-on-surface-variant);
  line-height: var(--sys-leading-normal);
}

.speed-selector {
  display: flex;
  background: var(--sys-color-surface-container-high);
  padding: 4px;
  border-radius: 99px;
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
  border-radius: 99px;
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
</style>
