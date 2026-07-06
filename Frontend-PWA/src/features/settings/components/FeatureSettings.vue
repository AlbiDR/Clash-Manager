<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from "vue";
import { SettingRow, SettingsCard, vTactile } from "@shared";
import { type WindowWithBridge } from "@core";
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
  // [THREAT:] Unvalidated hardware boundaries and 'any' pathogens.
  // [DECISION LOG] Utilizing strict type narrowing for WindowWithBridge to
  // ensure hardware bridge detection integrity.
  return !!(window as WindowWithBridge).AndroidBridge;
});

// Permission status state — updated on mount and on every window focus
// event so the badge reflects the current state after the user returns
// from the system settings screen.
const isAccessibilityAllowed = ref(false);
const isOverlayAllowed = ref(false);

/**
 * Polls both permission flags via the native bridge.
 * Safe to call at any time; no-op in non-native environments.
 */
function checkPermissions() {
  const bridge = (window as WindowWithBridge).AndroidBridge;
  if (!isNativeWrapper.value || !bridge) return;

  if (typeof bridge.isAccessibilityActive === "function") {
    isAccessibilityAllowed.value = bridge.isAccessibilityActive();
  }
  if (typeof bridge.hasOverlayPermission === "function") {
    isOverlayAllowed.value = bridge.hasOverlayPermission();
  }
}

/**
 * Deep-links the user to the Accessibility service settings screen.
 * Uses the native bridge when available; falls back to an intent URI
 * for the standard Android browser context.
 */
function locateAccessibilitySettings() {
  const bridge = (window as WindowWithBridge).AndroidBridge;
  if (bridge?.openAccessibilitySettings) {
    bridge.openAccessibilitySettings();
  } else {
    // Fallback intent URI for standard Android browsers.
    window.location.href =
      "intent:#Intent;action=android.settings.ACCESSIBILITY_SETTINGS;end";
  }
}

/**
 * Deep-links the user to the "Display over other apps" overlay
 * permission screen, scoped directly to this package.
 */
function locateOverlaySettings() {
  window.location.href =
    "intent:#Intent;action=android.settings.action.MANAGE_OVERLAY_PERMISSION;package=com.albidr.clashmanager;end";
}

// Calibration coordinates state
const inviteX = ref(50.83);
const inviteY = ref(72.14);
const closeX = ref(92.13);
const closeY = ref(20.44);

function loadCoordinates() {
  const bridge = (window as WindowWithBridge).AndroidBridge;
  if (isNativeWrapper.value && bridge?.getCoordinates) {
    try {
      const rawCoordinates = bridge.getCoordinates();
      const coords = JSON.parse(rawCoordinates);
      inviteX.value = Math.round(coords.inviteX * 10000) / 100;
      inviteY.value = Math.round(coords.inviteY * 10000) / 100;
      closeX.value = Math.round(coords.closeX * 10000) / 100;
      closeY.value = Math.round(coords.closeY * 10000) / 100;
    } catch (nativeCoordinatesError: unknown) {
      const errorMessage = nativeCoordinatesError instanceof Error ? nativeCoordinatesError.message : String(nativeCoordinatesError);
      console.error("Failed to parse native coordinates:", errorMessage);
    }
  }
}

let isLoaded = false;

function saveCoordinates() {
  if (!isLoaded) return;
  // [THREAT:] Hardware desynchronization if calling 'any' methods on Window.
  // [DECISION LOG] Enforcing the WindowWithBridge contract for coordinate persistence.
  const bridge = (window as WindowWithBridge).AndroidBridge;
  if (isNativeWrapper.value && bridge?.saveCoordinates) {
    const ix = typeof inviteX.value === "string" ? parseFloat(inviteX.value) : inviteX.value;
    const iy = typeof inviteY.value === "string" ? parseFloat(inviteY.value) : inviteY.value;
    const cx = typeof closeX.value === "string" ? parseFloat(closeX.value) : closeX.value;
    const cy = typeof closeY.value === "string" ? parseFloat(closeY.value) : closeY.value;

    if (!isNaN(ix) && !isNaN(iy) && !isNaN(cx) && !isNaN(cy)) {
      bridge.saveCoordinates(ix / 100, iy / 100, cx / 100, cy / 100);
    }
  }
}

// Auto-save coordinates to native bridge whenever any value changes.
// This replaces the manual "Apply" flow so the on-device session always
// boots with the last values the user dragged/typed in.
watch([inviteX, inviteY, closeX, closeY], saveCoordinates);

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
    locateAccessibilitySettings();
  }
}

onMounted(() => {
  loadCoordinates();
  checkPermissions();
  // Re-poll permissions whenever the user returns from the system settings
  window.addEventListener("focus", checkPermissions);
  nextTick(() => {
    isLoaded = true;
  });
  // Sync blitzMode setting state with native accessibility service status on mount
  const bridge = (window as WindowWithBridge).AndroidBridge;
  if (isNativeWrapper.value && bridge?.isAccessibilityActive) {
    const active = bridge.isAccessibilityActive();
    if (active !== modules.blitzMode) {
      toggle("blitzMode");
    }
  }
});

onUnmounted(() => {
  window.removeEventListener("focus", checkPermissions);
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

    <!-- Android permissions panel — only shown inside the native TWA wrapper -->
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
          @click="locateAccessibilitySettings"
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
          @click="locateOverlaySettings"
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
  height: 1.5px;
  background: var(--sys-color-outline-variant);
  opacity: 0.1;
  margin: var(--sys-space-20) 0;
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
</style>
