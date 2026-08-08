<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
/**
 * COMPONENT: AndroidCalibrationSettings.vue
 * ----------------------------------------------------------------------------
 * Rationale: Manages native Android permissions and screen calibration coordinates.
 * ----------------------------------------------------------------------------
 *
 * **Decision Log - Hardware & Native Integration:**
 * - Exposes controls for Accessibility Services and Display Overlays required by Blitz Mode.
 * - Handles screen coordinates mapping (as percentages) to support different mobile viewport models.
 * - Screen coordinates are automatically persisted through reactive watchers delegating directly to
 *   the Native JSBridge layer (`saveCoordinates`) upon any interaction/input changes.
 *
 * @remarks Satisfies CleanStack ADR Section IV: Hardware/Browser Brokering.
 */
import { watch } from "vue";
import { vTactile } from "@shared";
import { useNativeBridge } from "@core/services/useNativeBridge";

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

/**
 * Auto-save coordinate updates.
 *
 * @remarks
 * Sets up a reactive watcher targeting invite and close touch percentages.
 * Changes are instantly synchronized with the native host persistent layer,
 * mitigating data loss on dirty exits.
 */
watch([inviteX, inviteY, closeX, closeY], saveCoordinates);
</script>

<template>
  <!--
    Android permissions panel - only shown inside the native TWA wrapper.
    [DECISION LOG] Conditional layout containment prevents visual clutter and irrelevant
    options in desktop or standard mobile browser environments.
  -->
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

  <!--
    Live layout calibration controls for native Android wrapper.
    [DECISION LOG] Coordinates are expressed as percentages to maintain device-agnostic scale multiplier
    compliance regardless of native physical screen resolutions.
  -->
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
</template>

<style scoped>
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
</style>
