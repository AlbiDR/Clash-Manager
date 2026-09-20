<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { computed, onErrorCaptured, ref } from "vue";
import { useClipboard } from "../composables/useClipboard";
import { vTactile } from "../directives/vTactile";
import Icon from "./Icon.vue";

/**
 * [GUARD] ERROR BOUNDARY
 * Resilience #45: Captures runtime errors and provides a graceful recovery path.
 */
const error = ref<Error | null>(null);
const { clipboardState, copyText } = useClipboard();

const copyLabel = computed(() => {
  if (clipboardState.value === "copied") return "Copied error details";
  if (clipboardState.value === "unavailable") return "Copy unavailable";
  return "Copy error details";
});

onErrorCaptured((capturedError) => {
  error.value = capturedError instanceof Error ? capturedError : new Error(String(capturedError));
  console.error("[GUARD] CAPTURED BY ERRORBOUNDARY:", capturedError);
  return false; // Stop propagation to prevent app-wide crash
});

/**
 * Copies the error details to the clipboard.
 */
function copyErrorDetails() {
  if (!error.value) return;

  const title = "System Resilience";
  const description =
    "A rendering anomaly was detected. Our self-healing systems are standing by.";
  const content = `[${title}]\nAnomaly: ${description}\n\nMessage: ${error.value.message}\n\nStack: ${error.value.stack || "N/A"}`;

  void copyText(content);
}

/**
 * Resets the application state and reloads the page.
 */
function resetApplication() {
  error.value = null;
  // Clear any potentially corrupted temporary state
  sessionStorage.clear();
  window.location.reload();
}
</script>

<template>
  <div
    v-if="error"
    class="error-boundary"
  >
    <div class="error-content">
      <div class="error-icon-wrapper">
        <Icon
          name="warning"
          size="32"
          aria-hidden="true"
        />
      </div>
      <h2>System Resilience</h2>
      <p>
        A rendering anomaly was detected. Our self-healing systems are standing
        by.
      </p>

      <div class="error-details-container">
        <div
          v-if="error.message"
          class="error-details"
        >
          {{ error.message }}
        </div>
        <button
          v-tactile
          class="copy-btn hit-target"
          :class="{
            copied: clipboardState === 'copied',
            unavailable: clipboardState === 'unavailable',
          }"
          :aria-label="copyLabel"
          :title="copyLabel"
          @click="copyErrorDetails"
        >
          <Icon
            :name="clipboardState === 'copied' ? 'check' : 'copy'"
            size="18"
            aria-hidden="true"
          />
        </button>
      </div>

      <button
        v-tactile
        class="recover-btn"
        @click="resetApplication"
      >
        <span>Re-Initialize System</span>
      </button>
    </div>
  </div>
  <slot v-else />
</template>

<style scoped>
.error-boundary {
  padding: var(--sys-space-56) var(--sys-space-24);
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 300px;
}

.error-content {
  background: var(--sys-surface-glass);

  padding: var(--sys-space-40);
  border-radius: var(--sys-shape-corner-extra-large);
  text-align: center;
  max-width: 440px;
  width: 100%;
  border: 1px solid var(--sys-surface-glass-border);
  box-shadow: var(--sys-elevation-3);
  user-select: text; /* Enable selection on entire content */
}

.error-icon-wrapper {
  width: 72px;
  height: 72px;
  background: rgba(var(--sys-color-error-rgb), 0.1);
  color: var(--sys-color-error);
  border-radius: var(--sys-shape-corner-m);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto var(--sys-space-24);
  transform: rotate(-5deg);
  user-select: none; /* Keep icon non-selectable */
}

h2 {
  margin: 0 0 var(--sys-space-12);
  font-weight: 850;
  letter-spacing: -0.02em;
  color: var(--sys-color-on-surface);
}

p {
  margin: 0 0 var(--sys-space-28);
  line-height: 1.6;
  font-size: 15px;
  color: var(--sys-color-on-surface-variant);
}

.error-details-container {
  position: relative;
  margin-bottom: var(--sys-space-32);
}

.error-details {
  background: var(--sys-overlay-dark-subtle);
  padding: var(--sys-space-16) var(--sys-space-48) var(--sys-space-16) var(--sys-space-16);
  border-radius: var(--sys-shape-corner-large);
  font-family: var(--sys-font-family-mono);
  font-size: 12px;
  text-align: left;
  word-break: break-all;
  white-space: pre-wrap;
  max-height: 120px;
  overflow-y: auto;
  color: var(--sys-color-on-surface-variant);
  border: 1px solid var(--sys-overlay-dark-subtle);
  user-select: text;
}

.copy-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 32px;
  height: 32px;
  border-radius: var(--sys-shape-corner-small);
  border: none;
  background: var(--sys-color-surface-container-high);
  color: var(--sys-color-on-surface-variant);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all var(--sys-motion-duration-200) var(--sys-motion-spring);
  padding: 0;
  user-select: none; /* Keep button non-selectable */
}

/* 48px Touch Footprint compliance (Target B.2) via relative pseudo-element */
.copy-btn.hit-target {
  position: relative;
  z-index: 5;
}
.copy-btn.hit-target::after {
  content: "";
  position: absolute;
  inset: -8px;
}

.copy-btn:hover {
  background: var(--sys-color-surface-container-highest);
  color: var(--sys-color-primary);
  transform: scale(1.05);
}

.copy-btn:active {
  transform: scale(0.95);
}

.copy-btn.copied {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
}

.copy-btn.unavailable {
  color: var(--sys-color-error);
}

.recover-btn {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  border: none;
  padding: var(--sys-space-14) var(--sys-space-32);
  border-radius: var(--sys-shape-corner-full);
  font-weight: 750;
  font-size: 15px;
  cursor: pointer;
  transition: all var(--sys-motion-duration-300) cubic-bezier(0.2, 0, 0, 1);
  box-shadow: 0 8px 16px rgba(var(--sys-color-primary-rgb), 0.3);
}

.recover-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 20px rgba(var(--sys-color-primary-rgb), 0.4);
}

.recover-btn:active {
  transform: scale(0.96);
}

.recover-btn span {
  user-select: none;
}
</style>
