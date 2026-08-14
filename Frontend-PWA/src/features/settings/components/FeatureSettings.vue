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
import { SettingsCard, vTactile } from "@shared";
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
      <button
        v-tactile
        class="feature-toggle"
        :class="{ active: modules.ghostBenchmarking }"
        type="button"
        :disabled="isRefreshing"
        :aria-pressed="modules.ghostBenchmarking"
        @click="toggle('ghostBenchmarking')"
      >
        <span class="feature-copy">
          <span class="feature-label">Ghost Benchmarking</span>
          <span class="feature-state">{{ modules.ghostBenchmarking ? "On" : "Off" }}</span>
        </span>
        <span class="feature-switch" aria-hidden="true">
          <span class="feature-switch-thumb" />
        </span>
      </button>

      <button
        v-tactile
        class="feature-toggle"
        :class="{ active: modules.sortExplanation }"
        type="button"
        :disabled="isRefreshing"
        :aria-pressed="modules.sortExplanation"
        @click="toggle('sortExplanation')"
      >
        <span class="feature-copy">
          <span class="feature-label">Sorting Descriptions</span>
          <span class="feature-state">{{ modules.sortExplanation ? "On" : "Off" }}</span>
        </span>
        <span class="feature-switch" aria-hidden="true">
          <span class="feature-switch-thumb" />
        </span>
      </button>

      <button
        v-tactile
        class="feature-toggle"
        :class="{ active: modules.blitzMode }"
        type="button"
        :disabled="isRefreshing"
        :aria-pressed="modules.blitzMode"
        @click="handleBlitzToggle()"
      >
        <span class="feature-copy">
          <span class="feature-label">Blitz Mode</span>
          <span class="feature-state">{{ modules.blitzMode ? "On" : "Off" }}</span>
        </span>
        <span class="feature-switch" aria-hidden="true">
          <span class="feature-switch-thumb" />
        </span>
      </button>

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

.feature-toggle {
  min-height: 48px;
  width: 100%;
  border: 1px solid rgba(var(--sys-color-outline-rgb), 0.16);
  border-radius: 8px;
  padding: 8px 10px 8px 12px;
  background: var(--sys-color-surface-container-low);
  color: var(--sys-color-on-surface);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sys-space-12);
  text-align: left;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    transform 0.18s var(--sys-motion-spring);
}

.feature-toggle:hover:not(:disabled) {
  border-color: rgba(var(--sys-color-primary-rgb), 0.34);
  background: rgba(var(--sys-color-primary-rgb), 0.05);
}

.feature-toggle:active:not(:disabled) {
  transform: scale(0.99);
}

.feature-toggle:disabled {
  cursor: progress;
  opacity: 0.72;
}

.feature-toggle.active {
  border-color: rgba(var(--sys-color-primary-rgb), 0.34);
  background: rgba(var(--sys-color-primary-rgb), 0.08);
}

.feature-copy {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--sys-space-8);
}

.feature-label {
  min-width: 0;
  color: var(--sys-color-on-surface);
  font-size: var(--sys-typescale-body-sm);
  font-weight: 700;
  line-height: 1.2;
}

.feature-state {
  flex: 0 0 auto;
  min-width: 34px;
  border-radius: 8px;
  padding: 3px 7px;
  background: rgba(var(--sys-color-outline-rgb), 0.1);
  color: var(--sys-color-on-surface-variant);
  font-size: var(--sys-typescale-meta);
  font-weight: 800;
  line-height: 1;
  text-align: center;
}

.feature-toggle.active .feature-state {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
}

.feature-switch {
  flex: 0 0 auto;
  width: 42px;
  height: 24px;
  border-radius: 999px;
  padding: 3px;
  background: rgba(var(--sys-color-outline-rgb), 0.24);
  display: flex;
  align-items: center;
  transition: background 0.18s ease;
}

.feature-toggle.active .feature-switch {
  background: var(--sys-color-primary);
}

.feature-switch-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--sys-color-surface);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.28);
  transition: transform 0.18s var(--sys-motion-spring);
}

.feature-toggle.active .feature-switch-thumb {
  transform: translateX(18px);
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
  .feature-copy,
  .blitz-speed-section {
    align-items: flex-start;
    flex-direction: column;
  }

  .feature-toggle {
    align-items: flex-start;
  }
}
</style>
