<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { watch } from "vue";
import { SettingRow, SettingsCard, vTactile } from "@shared";
import { useNativeBridge } from "@core/services/useNativeBridge";
import { useSettings } from "../composables/useSettings";

defineProps<{
  initiallyExpanded?: boolean;
}>();

const { modules, toggle, isRefreshing, setBlitzSpeed } = useSettings();
const {
  isNativeWrapper,
  isAccessibilityAllowed,
  isOverlayAllowed,
  inviteX,
  inviteY,
  closeX,
  closeY,
  openAccessibilitySettings,
  openOverlaySettings,
  saveCoordinates,
} = useNativeBridge();

// Auto-save coordinates to native bridge whenever any value changes.
watch([inviteX, inviteY, closeX, closeY], saveCoordinates);

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

    <!-- Android permissions panel - only shown inside the native TWA wrapper -->
    <div v-if="isNativeWrapper" class="permissions-section">
      <div class="card-divider-s" />
      <h3 class="section-title">Android Permissions</h3>
      <p class="section-desc">
        Blitz Mode requires both permissions below. Tap a row to open the relevant system screen.
      </p>

      <div class="permission-list">
        <!-- Accessibility Service -->
        <button
          v-tactile
          class="permission-row"
          :class="{ 'permission-row--granted': isAccessibilityAllowed }"
          @click="openAccessibilitySettings"
        >
          <span class="permission-dot" :class="isAccessibilityAllowed ? 'permission-dot--on' : 'permission-dot--off'" />
          <span class="permission-info">
            <span class="permission-label">Accessibility Service</span>
            <span class="permission-status">{{ isAccessibilityAllowed ? 'Allowed' : 'Not allowed' }}</span>
          </span>
          <svg class="permission-arrow" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6-6-6z" fill="currentColor" />
          </svg>
        </button>

        <!-- Overlay (Draw over other apps) -->
        <button
          v-tactile
          class="permission-row"
          :class="{ 'permission-row--granted': isOverlayAllowed }"
          @click="openOverlaySettings"
        >
          <span class="permission-dot" :class="isOverlayAllowed ? 'permission-dot--on' : 'permission-dot--off'" />
          <span class="permission-info">
            <span class="permission-label">Display Over Other Apps</span>
            <span class="permission-status">{{ isOverlayAllowed ? 'Allowed' : 'Not allowed' }}</span>
          </span>
          <svg class="permission-arrow" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6-6-6z" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Live layout calibration controls for native Android wrapper -->
    <div v-if="isNativeWrapper" class="calibration-section">
      <div class="card-divider-s" />
      <h3 class="section-title">Blitz Mode Calibration</h3>
      <p class="section-desc">Changes are saved automatically and become the default for the next session.</p>

      <div class="input-grid">
        <div class="input-group">
          <label>Invite X (%)</label>
          <input type="number" step="0.01" v-model="inviteX" class="coord-input" />
        </div>
        <div class="input-group">
          <label>Invite Y (%)</label>
          <input type="number" step="0.01" v-model="inviteY" class="coord-input" />
        </div>
        <div class="input-group">
          <label>Close X (%)</label>
          <input type="number" step="0.01" v-model="closeX" class="coord-input" />
        </div>
        <div class="input-group">
          <label>Close Y (%)</label>
          <input type="number" step="0.01" v-model="closeY" class="coord-input" />
        </div>
      </div>
    </div>
  </SettingsCard>
</template>

<style scoped>
.features-list {
  display: flex;
  flex-direction: column;
  gap: var(--sys-space-16);
}

.card-divider-s {
  height: 1px;
  background: var(--sys-color-outline-variant);
  opacity: 0.15;
  margin: var(--sys-space-16) 0;
}

/* ── Permissions Section ── */
.permissions-section {
  display: flex;
  flex-direction: column;
  gap: var(--sys-space-12);
}

.permission-list {
  display: flex;
  flex-direction: column;
  gap: var(--sys-space-8);
}

.permission-row {
  display: flex;
  align-items: center;
  gap: var(--sys-space-12);
  padding: var(--sys-space-12) var(--sys-space-14);
  background: var(--sys-color-surface-container);
  border-radius: var(--sys-shape-corner-medium);
  border: 1.5px solid var(--sys-color-outline-variant);
  cursor: pointer;
  transition:
    border-color var(--sys-motion-duration-200) var(--sys-motion-easing-standard),
    background var(--sys-motion-duration-200) var(--sys-motion-easing-standard);
  width: 100%;
  text-align: left;
  color: var(--sys-color-on-surface);
}

.permission-row--granted {
  border-color: var(--sys-color-primary);
  background: color-mix(in srgb, var(--sys-color-primary) 6%, var(--sys-color-surface-container));
}

.permission-dot {
  width: var(--sys-space-8);
  height: var(--sys-space-8);
  border-radius: var(--sys-shape-corner-full);
  flex-shrink: 0;
  transition: background var(--sys-motion-duration-200) var(--sys-motion-easing-standard);
}

.permission-dot--on {
  background: var(--sys-color-primary);
  box-shadow: 0 0 var(--sys-space-6) color-mix(in srgb, var(--sys-color-primary) 60%, transparent);
}

.permission-dot--off {
  background: var(--sys-color-on-surface-variant);
  opacity: 0.4;
}

.permission-info {
  display: flex;
  flex-direction: column;
  gap: var(--sys-space-2);
  flex: 1;
  min-width: 0;
}

.permission-label {
  font-size: var(--sys-typescale-body-sm);
  font-weight: 600;
  color: var(--sys-color-on-surface);
  letter-spacing: var(--sys-tracking-normal);
}

.permission-status {
  font-size: var(--sys-typescale-meta);
  font-weight: 500;
  color: var(--sys-color-on-surface-variant);
}

.permission-row--granted .permission-status {
  color: var(--sys-color-primary);
}

.permission-arrow {
  flex-shrink: 0;
  color: var(--sys-color-on-surface-variant);
  opacity: 0.5;
}

/* ── Calibration Section ── */
.calibration-section {
  display: flex;
  flex-direction: column;
  gap: var(--sys-space-12);
}

.section-title {
  font-size: var(--sys-typescale-body-sm);
  font-weight: 700;
  color: var(--sys-color-on-surface);
  margin: 0;
}

.section-desc {
  font-size: var(--sys-typescale-meta);
  color: var(--sys-color-on-surface-variant);
  margin: 0;
  line-height: var(--sys-leading-normal);
}

.input-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sys-space-8);
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: var(--sys-space-4);
}

.input-group label {
  font-size: var(--sys-typescale-label-md);
  font-weight: 700;
  color: var(--sys-color-on-surface-variant);
  text-transform: uppercase;
  letter-spacing: var(--sys-tracking-wide);
}

.coord-input {
  background: var(--sys-color-surface-container);
  border: 1px solid var(--sys-color-outline-variant);
  border-radius: var(--sys-shape-corner-small);
  color: var(--sys-color-on-surface);
  font-size: var(--sys-typescale-body-sm);
  font-weight: 600;
  padding: var(--sys-space-8) var(--sys-space-10);
  width: 100%;
  box-sizing: border-box;
  transition: border-color var(--sys-motion-duration-200) var(--sys-motion-easing-standard);
}

.coord-input:focus {
  outline: none;
  border-color: var(--sys-color-primary);
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
