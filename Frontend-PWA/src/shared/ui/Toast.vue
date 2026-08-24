<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import Icon from "./Icon.vue";
import { ref, onMounted, onUnmounted } from "vue";

/**
 * [SHARED] TOAST NOTIFICATION
 * ----------------------------------------------------------------------------
 * Rationale: Standardized transient feedback molecule for system events.
 * Features: Auto-dismissal, Action buttons, Clipboard integration.
 * ----------------------------------------------------------------------------
 */

const props = defineProps<{
  /** Unique identifier for the toast instance. */
  id: string;
  /** The semantic type of the toast, determining its visual style. */
  type: "success" | "error" | "info" | "undo";
  /** The message text to display. */
  message: string;
  /** Visibility duration in milliseconds. Set to 0 for persistent toasts. */
  duration?: number;
  /** Optional label for an action button (e.g., "UNDO"). */
  actionLabel?: string;
}>();

const emit = defineEmits<{
  /** Emitted when the toast is dismissed (either manually or via timeout). */
  dismiss: [id: string];
  /** Emitted when the user clicks the action button. */
  action: [id: string];
}>();

/** @internal Internal timer ID used for auto-dismissal cleanup. */
let timer: number | undefined;
const isHandlingAction = ref(false);
const showCopiedTick = ref(false);

function startTimer() {
  if (props.duration && !showCopiedTick.value) {
    timer = window.setTimeout(() => {
      emit("dismiss", props.id);
    }, props.duration);
  }
}

function clearTimer() {
  if (timer) clearTimeout(timer);
}

function handleMainClick() {
  if (props.actionLabel) {
    triggerAction();
  }
}

function triggerAction() {
  if (isHandlingAction.value) return;
  isHandlingAction.value = true;
  emit("action", props.id);
}

/**
 * Copies the toast message to the system clipboard.
 */
async function copyToClipboard() {
  try {
    // [DECISION LOG] Error and Info messages are explicitly selectable and
    // copyable to satisfy the "Error Readability Contract" in ADR Section IV.
    await navigator.clipboard.writeText(props.message);
    showCopiedTick.value = true;
    clearTimer();
    setTimeout(() => {
      showCopiedTick.value = false;
      startTimer();
    }, 2000);
  } catch (clipboardError) {
    console.error("Failed to copy toast message:", clipboardError);
  }
}

onMounted(startTimer);
onUnmounted(clearTimer);
</script>

<template>
  <div
    class="toast"
    :class="[type, { 'is-actionable': !!actionLabel }]"
    @mouseenter="clearTimer"
    @mouseleave="startTimer"
    @click="handleMainClick"
  >
    <!-- Visual Indicator for Undo (Progress circle or icon) -->
    <div
      v-if="type === 'undo'"
      class="icon-side undo-icon"
    >
      <Icon
        name="undo"
        size="18"
      />
    </div>

    <div
      v-else
      class="icon-side"
    >
      <Icon
        v-if="type === 'success'"
        name="check"
        size="20"
      />
      <Icon
        v-else-if="type === 'error'"
        name="warning"
        size="20"
      />
      <Icon
        v-else
        name="info"
        size="20"
      />
    </div>

    <div class="message">
      {{ message }}
    </div>

    <!-- Copy Button for Error and Info notifications -->
    <button 
      v-if="type === 'error' || type === 'info'" 
      class="copy-btn" 
      title="Copy message"
      @click.stop="copyToClipboard"
    >
      <Icon
        :name="showCopiedTick ? 'check' : 'copy'"
        size="16"
      />
    </button>

    <button
      v-if="actionLabel"
      class="action-btn"
      :disabled="isHandlingAction"
      @click.stop="triggerAction"
    >
      {{ actionLabel }}
    </button>

    <button
      class="close-btn"
      @click.stop="$emit('dismiss', id)"
    >
      <Icon
        name="close"
        size="16"
      />
    </button>
  </div>
</template>

<style scoped>
.toast {
  display: flex;
  align-items: flex-start; /* Align top for multiline compatibility */
  gap: 12px;
  background: var(--sys-surface-glass);

  color: var(--sys-color-on-surface);
  padding: 12px 16px;
  border-radius: 20px; /* Subtle rounded corners for multiline layout compatibility */
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  min-width: 280px;
  max-width: 90vw;
  border: 1px solid var(--sys-surface-glass-border);
  pointer-events: auto;
  transition:
    transform 0.2s var(--sys-motion-spring),
    box-shadow 0.2s;
  user-select: text;
  -webkit-user-select: text;
}

.toast.is-actionable {
  cursor: pointer;
}
.toast.is-actionable:active {
  transform: scale(0.96);
}

/* Success State */
.toast.success {
  background: var(--sys-color-success-container);
  color: #002105; /* Fallback high contrast */
  border-color: rgba(0, 0, 0, 0.05);
}

/* Error State */
.toast.error {
  background: var(--sys-color-error-container);
  color: var(--sys-color-on-error-container);
  border-color: rgba(0, 0, 0, 0.05);
}

/* Undo State (Premium Dark Glass) */
.toast.undo {
  background: var(--sys-color-inverse-surface);
  color: var(--sys-color-inverse-on-surface);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 12px 20px;
}

.icon-side {
  display: flex;
  align-items: center;
  opacity: 0.9;
  margin-top: 1px; /* Align perfectly with first text line */
}

.undo-icon {
  color: var(--sys-color-inverse-primary);
}

.message {
  flex: 1;
  font-weight: 700;
  font-size: 14px;
  line-height: 1.4;
  word-break: break-word;
  white-space: pre-wrap;
  user-select: text;
  -webkit-user-select: text;
}

.copy-btn {
  background: none;
  border: none;
  color: inherit;
  opacity: 0.6;
  cursor: pointer;
  padding: 6px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.2s, background 0.2s;
  margin-left: 2px;
  margin-top: -1px; /* Align with first line */
}
.copy-btn:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.1);
}

.action-btn {
  background: var(--sys-color-inverse-primary);
  color: var(--sys-color-inverse-surface);
  border: none;
  border-radius: 99px;
  padding: 6px 14px;
  font-weight: 800;
  font-size: 12px;
  text-transform: uppercase;
  cursor: pointer;
}
.action-btn:active {
  opacity: 0.8;
  transform: translateY(1px);
}
.action-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

/* Standard Action Btn (Non-Undo) */
.toast:not(.undo) .action-btn {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  box-shadow: none;
}

.close-btn {
  background: none;
  border: none;
  color: inherit;
  opacity: 0.5;
  cursor: pointer;
  padding: 4px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.2s;
  margin-left: -4px;
  margin-top: 1px; /* Align with first line */
}
.close-btn:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.1);
}
</style>
