<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import { SettingRow, SettingsCard, vTactile } from "@shared";
import { useSettings } from "../composables/useSettings";

defineProps<{
  initiallyExpanded?: boolean;
}>();

const { modules, toggle, isRefreshing } = useSettings();

/**
 * Detects whether the app is running inside the native Android TWA wrapper.
 * When the AndroidBridge JSBridge is injected, Blitz Mode is always delegated
 * to the native foreground service and does not require the manual module toggle.
 */
const isNativeWrapper = computed(() => {
  if (typeof window === "undefined") return false;
  return !!(window as any).AndroidBridge;
});

// Calibration coordinates state
const inviteX = ref(50.83);
const inviteY = ref(72.14);
const closeX = ref(92.13);
const closeY = ref(20.44);

function loadCoordinates() {
  if (isNativeWrapper.value && (window as any).AndroidBridge?.getCoordinates) {
    try {
      const coords = JSON.parse((window as any).AndroidBridge.getCoordinates());
      inviteX.value = Math.round(coords.inviteX * 10000) / 100;
      inviteY.value = Math.round(coords.inviteY * 10000) / 100;
      closeX.value = Math.round(coords.closeX * 10000) / 100;
      closeY.value = Math.round(coords.closeY * 10000) / 100;
    } catch (e) {
      console.error("Failed to parse native coordinates", e);
    }
  }
}

function applyPhonePreset() {
  inviteX.value = 50.83;
  inviteY.value = 72.14;
  closeX.value = 92.13;
  closeY.value = 20.44;
  saveCoordinates();
}

function applyBluestacksPreset() {
  inviteX.value = 53.30;
  inviteY.value = 77.90;
  closeX.value = 92.04;
  closeY.value = 14.29;
  saveCoordinates();
}

function saveCoordinates() {
  if (isNativeWrapper.value && (window as any).AndroidBridge?.saveCoordinates) {
    (window as any).AndroidBridge.saveCoordinates(
      inviteX.value / 100,
      inviteY.value / 100,
      closeX.value / 100,
      closeY.value / 100
    );
  }
}

/**
 * Handles the Blitz Mode toggle in non-native-wrapper (PWA) mode.
 *
 * When enabling Blitz Mode, the Android foreground service requires two system
 * permissions: "Draw over other apps" (overlay) and the Accessibility service.
 * The overlay redirect is handled by the native side on toggle. The accessibility
 * activation panel must be opened explicitly from the web side right after.
 */
function handleBlitzToggle() {
  const wasEnabled = !!modules.blitzMode;
  toggle("blitzMode");

  // Only redirect to accessibility activation when the setting is being enabled
  if (!wasEnabled) {
    const bridge = (window as any).AndroidBridge;
    if (bridge?.openAccessibilitySettings) {
      bridge.openAccessibilitySettings();
    } else {
      // Fallback intent URI for standard Android browsers.
      window.location.href =
        "intent:#Intent;action=android.settings.ACCESSIBILITY_SETTINGS;end";
    }
  }
}

onMounted(() => {
  loadCoordinates();
});
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
    </div>

    <!-- Live layout calibration controls for native Android wrapper -->
    <div v-if="isNativeWrapper" class="calibration-section">
      <div class="card-divider-s" />
      <h3 class="section-title">Blitz Mode Calibration</h3>
      <p class="section-desc">Adjust tap coordinates to match your screen resolution or emulator layout.</p>
      
      <div class="preset-row">
        <button class="preset-btn" @click="applyPhonePreset" v-tactile>Phone Preset</button>
        <button class="preset-btn" @click="applyBluestacksPreset" v-tactile>BlueStacks Preset</button>
      </div>
      
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
      
      <button class="apply-btn" @click="saveCoordinates" v-tactile>Apply Calibration</button>
    </div>
  </SettingsCard>
</template>

<style scoped>
.features-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.card-divider-s {
  height: 1.5px;
  background: var(--sys-color-outline-variant);
  opacity: 0.1;
  margin: 20px 0;
}

.calibration-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--sys-color-on-surface);
  margin: 0;
}

.section-desc {
  font-size: 11px;
  color: var(--sys-color-on-surface-variant);
  margin: 0;
  line-height: 1.4;
}

.preset-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.preset-btn {
  padding: 10px 8px;
  background: var(--sys-color-surface-container-high);
  border: 1px solid var(--sys-color-outline-variant);
  border-radius: 12px;
  color: var(--sys-color-primary);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s cubic-bezier(0.2, 0, 0, 1), background-color 0.15s;
}

.preset-btn:active {
  transform: scale(0.94);
  background: var(--sys-color-surface-container-highest);
}

.input-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.input-group label {
  font-size: 10px;
  font-weight: 700;
  color: var(--sys-color-on-surface-variant);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.coord-input {
  background: var(--sys-color-surface-container);
  border: 1px solid var(--sys-color-outline-variant);
  border-radius: 8px;
  color: var(--sys-color-on-surface);
  font-size: 13px;
  font-weight: 600;
  padding: 8px 10px;
  width: 100%;
  box-sizing: border-box;
  transition: border-color 0.15s;
}

.coord-input:focus {
  outline: none;
  border-color: var(--sys-color-primary);
}

.apply-btn {
  width: 100%;
  padding: 12px;
  background: var(--sys-color-primary);
  border: none;
  border-radius: 12px;
  color: var(--sys-color-on-primary);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s cubic-bezier(0.2, 0, 0, 1), opacity 0.15s;
}

.apply-btn:active {
  transform: scale(0.97);
  opacity: 0.85;
}
</style>
