<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->

<script setup lang="ts">
import { useConfirm } from "@core";
import { vTactile } from "../directives/vTactile";

/**
 * COMPONENT: ConfirmDialog.vue
 * ----------------------------------------------------------------------------
 * Rationale: MD3-styled replacement for the native `window.confirm()` dialog,
 * which renders as an unstyled legacy system dialog inside the Android WebView
 * shell (APK). Mounted once globally, driven by `useConfirm`'s reactive state.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * Architectural Context:
 * - Layer: Layer 2 Shared UI Primitives (@shared/ui)
 * - Satisfaction: Satisfies ADR Section III: Visual Purity.
 */
const { active, resolve } = useConfirm();
</script>

<template>
  <Teleport to="body">
    <Transition name="console-expand">
      <div
        v-if="active"
        class="confirm-overlay"
        @click.self="resolve(false)"
      >
        <div class="confirm-card glassmorphic">
          <h3>{{ active.title }}</h3>
          <p
            v-if="active.message"
            class="confirm-message"
          >
            {{ active.message }}
          </p>

          <div class="confirm-actions">
            <button
              v-tactile
              class="confirm-btn cancel-btn"
              @click="resolve(false)"
            >
              {{ active.cancelLabel }}
            </button>
            <button
              v-tactile
              class="confirm-btn accept-btn"
              :class="{ danger: active.tone === 'danger' }"
              @click="resolve(true)"
            >
              {{ active.confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 3000;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 24px;
  touch-action: none;
}

.confirm-card {
  width: 100%;
  max-width: 360px;
  background: var(--sys-surface-glass);
  border: 1px solid var(--sys-surface-glass-border);
  border-radius: 28px;
  padding: 24px;
  box-shadow: var(--sys-elevation-4);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.confirm-card h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 950;
  color: var(--sys-color-on-surface);
  letter-spacing: -0.02em;
}

.confirm-message {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--sys-color-on-surface-variant);
  white-space: pre-line;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.confirm-btn {
  border: none;
  border-radius: 100px;
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1), opacity 0.2s, background-color 0.2s;
}
.confirm-btn:active {
  transform: scale(0.95);
  opacity: 0.85;
}

.cancel-btn {
  background: transparent;
  color: var(--sys-color-on-surface-variant);
}

.accept-btn {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
}
.accept-btn.danger {
  background: var(--sys-color-error);
  color: var(--sys-color-on-error);
}

.console-expand-enter-active,
.console-expand-leave-active {
  transition: opacity 0.3s ease;
}
.console-expand-enter-from,
.console-expand-leave-to {
  opacity: 0;
}
.console-expand-enter-active .confirm-card,
.console-expand-leave-active .confirm-card {
  transition: transform 0.35s var(--sys-motion-spring), opacity 0.3s ease;
}
.console-expand-enter-from .confirm-card {
  transform: scale(0.92);
  opacity: 0;
}
.console-expand-leave-to .confirm-card {
  transform: scale(0.96);
  opacity: 0;
}
</style>
