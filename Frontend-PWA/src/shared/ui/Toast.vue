<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import Icon from "./Icon.vue";
import {
  CLIPBOARD_FEEDBACK_DURATION_MS,
  useClipboard,
} from "../composables/useClipboard";
import { DEFAULT_TOAST_DURATION_MS } from "@core/services/useToast";
import { vTactile } from "../directives/vTactile";
import { computed, ref, onUnmounted } from "vue";

/**
 * ============================================================================
 * [SHARED UI] TOAST NOTIFICATION
 * ----------------------------------------------------------------------------
 * Standardized transient feedback molecule for system events.
 * Presents service-managed auto-dismissal, single-flight actions, and clipboard copy.
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 2 Shared UI (@shared/ui)
 * - **Role:** Reusable transient notification molecule.
 * - **Permitted Imports:** Directive bindings (`vTactile`), Icon molecule, Vue reactivity primitives.
 *
 * Satisfies ADR Section II: Presentation Orchestration & Layer Boundaries.
 * Satisfies ADR Section IV: User Experience & Interaction Protocols.
 * ============================================================================
 */

const props = defineProps<{
  /** Unique identifier for the toast instance. */
  id: string;
  /** The semantic type of the toast, determining its visual style and icon. */
  type: "success" | "error" | "info" | "undo";
  /** The message text to display. */
  message: string;
  /** Visibility duration in milliseconds. Set to 0 for persistent toasts. */
  duration?: number;
  /** Optional label for an action button (e.g., "UNDO"). */
  actionLabel?: string;
}>();

const emit = defineEmits<{
  /** Emitted when the toast is manually dismissed. */
  dismiss: [id: string];
  /** Emitted when the user clicks the action button. */
  action: [id: string];
  /** Requests that the service preserve the current remaining lifetime. */
  "pause-dismissal": [id: string];
  /** Requests that the service continue from the preserved remaining lifetime. */
  "resume-dismissal": [id: string];
}>();

/** @internal Holds the transient copy acknowledgement without leaking it after dismissal. */
let copyFeedbackTimer: number | undefined;

type DismissalHold = "pointer" | "focus" | "clipboard";

/** Interaction reasons currently keeping this toast readable. */
const dismissalHolds = new Set<DismissalHold>();

/** @internal Prevents duplicate emission of action callbacks. */
const isHandlingAction = ref(false);

/** @internal Controls visual confirmation tick state after clipboard copy. */
const showCopiedTick = ref(false);
const { clipboardState, copyText } = useClipboard();

const copyLabel = computed(() => {
  if (showCopiedTick.value) return "Copied message";
  if (clipboardState.value === "unavailable") return "Copy unavailable";
  return "Copy message";
});

/** Clears a pending copy acknowledgement when the toast is retried or unmounted. */
function clearCopyFeedbackTimer() {
  if (copyFeedbackTimer !== undefined) {
    clearTimeout(copyFeedbackTimer);
    copyFeedbackTimer = undefined;
  }
}

/**
 * Handles clicks on the toast container when actionLabel is present.
 */
function handleMainClick() {
  if (props.actionLabel) {
    triggerAction();
  }
}

/**
 * Adds an interaction hold and pauses the service clock on the first hold.
 * The component coordinates interaction reasons only. The service remains the
 * sole owner of elapsed and remaining lifetime state.
 */
function holdDismissal(reason: DismissalHold) {
  if (dismissalHolds.has(reason)) return;
  const shouldPauseService = dismissalHolds.size === 0;
  dismissalHolds.add(reason);
  if (shouldPauseService) emit("pause-dismissal", props.id);
}

/** Removes one interaction hold and resumes only after every hold is gone. */
function releaseDismissal(reason: DismissalHold) {
  if (!dismissalHolds.delete(reason)) return;
  if (dismissalHolds.size === 0) emit("resume-dismissal", props.id);
}

/** Releases a paused service clock if the visual owner leaves unexpectedly. */
function releaseAllDismissalHolds() {
  if (dismissalHolds.size === 0) return;
  dismissalHolds.clear();
  emit("resume-dismissal", props.id);
}

function handlePointerEnter() {
  if (props.type === "undo") return;
  holdDismissal("pointer");
}

function handlePointerLeave() {
  if (props.type === "undo") return;
  releaseDismissal("pointer");
}

function handleFocusIn() {
  if (props.type === "undo") return;
  holdDismissal("focus");
}

function handleFocusOut(focusEvent: FocusEvent) {
  if (props.type === "undo") return;

  const toastElement = focusEvent.currentTarget as HTMLElement | null;
  const nextFocusedElement = focusEvent.relatedTarget;
  if (
    toastElement
    && nextFocusedElement instanceof Node
    && toastElement.contains(nextFocusedElement)
  ) {
    return;
  }

  releaseDismissal("focus");
}

/**
 * Emits the action event once per click interaction.
 *
 * [DECISION LOG] Employs `isHandlingAction` lock flag to prevent duplicate event broadcasts.
 * [THREAT] Double-tap on action button triggering duplicate undo/retry operations.
 */
function triggerAction() {
  if (isHandlingAction.value) return;
  isHandlingAction.value = true;
  emit("action", props.id);
}

/**
 * Copies the toast message to the system clipboard.
 *
 * [DECISION LOG] Error and Info messages are explicitly selectable and
 * copyable to satisfy the "Error Readability Contract" in ADR Section IV.
 * Pauses dismissal timer during copy confirmation feedback tick.
 * [THREAT] Clipboard API rejection on unsecured context caught gracefully without crashing host UI.
 */
async function copyToastMessage() {
  holdDismissal("clipboard");
  const copied = await copyText(props.message, { feedbackDurationMs: 0 });
  if (!copied) {
    releaseDismissal("clipboard");
    return;
  }

  clearCopyFeedbackTimer();
  showCopiedTick.value = true;
  copyFeedbackTimer = window.setTimeout(() => {
    showCopiedTick.value = false;
    copyFeedbackTimer = undefined;
    releaseDismissal("clipboard");
  }, CLIPBOARD_FEEDBACK_DURATION_MS);
}

function dismissToast() {
  emit("dismiss", props.id);
}

onUnmounted(() => {
  clearCopyFeedbackTimer();
  releaseAllDismissalHolds();
});
</script>

<template>
  <div
    class="toast"
    :class="[type, { 'is-actionable': !!actionLabel }]"
    :style="type === 'undo' ? { '--toast-duration': `${duration ?? DEFAULT_TOAST_DURATION_MS}ms` } : undefined"
    @mouseenter="handlePointerEnter"
    @mouseleave="handlePointerLeave"
    @focusin="handleFocusIn"
    @focusout="handleFocusOut"
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
      v-tactile
      type="button"
      class="copy-btn"
      :class="{ 'is-copied': showCopiedTick, 'is-unavailable': clipboardState === 'unavailable' }"
      :aria-label="copyLabel"
      :title="copyLabel"
      @click.stop="copyToastMessage"
    >
      <Icon
        :name="showCopiedTick ? 'check' : 'copy'"
        size="16"
      />
    </button>

    <button
      v-if="actionLabel"
      v-tactile
      type="button"
      class="action-btn"
      :disabled="isHandlingAction"
      @click.stop="triggerAction"
    >
      {{ actionLabel }}
    </button>

    <button
      v-tactile
      type="button"
      class="close-btn"
      aria-label="Dismiss notification"
      @click.stop="dismissToast"
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
  position: relative;
  display: flex;
  /* Real 48px controls need a common center line. Multiline copy retains the
     flexible middle column while actions stay stable instead of hanging from
     undersized first-line hit targets. */
  align-items: center;
  gap: var(--sys-space-12);
  background: var(--sys-surface-glass);

  color: var(--sys-color-on-surface);
  padding: var(--sys-space-12) var(--sys-space-16);
  border-radius: var(--sys-shape-corner-m); /* Subtle rounded corners for multiline layout compatibility */
  box-shadow: 0 8px 32px var(--sys-overlay-dark-medium);
  min-width: min(
    280px,
    calc(100vw - var(--sys-safe-left) - var(--sys-safe-right) - var(--sys-space-24))
  );
  max-width: min(
    90vw,
    calc(100vw - var(--sys-safe-left) - var(--sys-safe-right) - var(--sys-space-24))
  );
  border: 1px solid var(--sys-surface-glass-border);
  pointer-events: auto;
  transition:
    transform var(--sys-motion-duration-200) var(--sys-motion-spring),
    box-shadow var(--sys-motion-duration-200);
  -webkit-user-select: text;
  user-select: text;
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
  color: var(--sys-color-on-success-container);
  border-color: var(--sys-overlay-dark-subtle);
}

/* Error State */
.toast.error {
  background: var(--sys-color-error-container);
  color: var(--sys-color-on-error-container);
  border-color: var(--sys-overlay-dark-subtle);
}

/* Undo State (Premium Dark Glass) */
.toast.undo {
  background: var(--sys-color-inverse-surface);
  color: var(--sys-color-inverse-on-surface);
  border: 1px solid var(--sys-overlay-light-soft);
  padding: var(--sys-space-12) var(--sys-space-20);
  overflow: hidden;
}

/* Undo expires by design. This quiet rail makes that window visible without
   adding a second countdown label or competing with the single Undo action. */
.toast.undo::after {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 2px;
  content: "";
  background: var(--sys-color-inverse-primary);
  transform-origin: left;
  animation: undo-window-countdown var(--toast-duration) linear forwards;
}

@keyframes undo-window-countdown {
  from { transform: scaleX(1); }
  to { transform: scaleX(0); }
}

.icon-side {
  display: flex;
  align-items: center;
  opacity: 0.9;
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
  -webkit-user-select: text;
  user-select: text;
}

.copy-btn {
  background: none;
  border: none;
  color: inherit;
  opacity: 0.6;
  cursor: pointer;
  width: var(--sys-space-48);
  min-width: var(--sys-space-48);
  height: var(--sys-space-48);
  min-height: var(--sys-space-48);
  padding: 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    opacity var(--sys-motion-duration-200) var(--sys-motion-easing-standard),
    background-color var(--sys-motion-duration-200) var(--sys-motion-easing-standard),
    color var(--sys-motion-duration-200) var(--sys-motion-easing-standard),
    transform var(--sys-motion-duration-200) var(--sys-motion-spring);
  flex: 0 0 var(--sys-space-48);
}
.copy-btn:hover {
  opacity: 1;
  background: var(--sys-overlay-light-soft);
}
.copy-btn.is-copied {
  opacity: 1;
  background: var(--sys-overlay-light-soft);
}
.copy-btn.is-unavailable {
  color: var(--sys-color-error);
  opacity: 1;
}

.action-btn {
  background: var(--sys-color-inverse-primary);
  color: var(--sys-color-inverse-surface);
  border: none;
  border-radius: var(--sys-shape-corner-full);
  min-height: var(--sys-space-48);
  padding: 0 var(--sys-space-14);
  font-weight: 800;
  font-size: 12px;
  text-transform: uppercase;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
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
  width: var(--sys-space-48);
  min-width: var(--sys-space-48);
  height: var(--sys-space-48);
  min-height: var(--sys-space-48);
  padding: 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity var(--sys-motion-duration-200);
  flex: 0 0 var(--sys-space-48);
}

.close-btn:hover {
  opacity: 1;
  background: var(--sys-overlay-light-soft);
}

.copy-btn:focus-visible,
.action-btn:focus-visible,
.close-btn:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  :global(:root:not([data-motion-preference="standard"]) .toast.undo::after) {
    animation: none;
  }
}

:global(:root[data-motion-preference="reduced"] .toast.undo::after) { animation: none; }
</style>
