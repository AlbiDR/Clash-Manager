<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, useId, useTemplateRef } from "vue";
import { useStatusPill } from "../composables/useStatusPill";
import { vTactile } from "../directives/vTactile";
import Icon from "./Icon.vue";
import type { ConsoleRemoteInfo } from "@core/types";

const props = defineProps<{
  type: "success" | "warning" | "error" | "loading";
  text: string;
  nominal?: boolean;
  remoteInfo?: ConsoleRemoteInfo;
  /** Stage 1 keeps only the status color; later stages are handled by the host. */
  compressionStage?: number;
}>();

const emit = defineEmits<{
  /** Requests a real console refresh from the status detail surface. */
  refresh: [];
}>();

const { isExpanded, isDB, displayText, displaySource, statusSummary, handleToggle } = useStatusPill(props);
const detailsId = useId();
const statusControl = useTemplateRef<HTMLElement>("statusControl");

const detailsAvailable = computed(() =>
  Boolean(
    displaySource.value
    || props.remoteInfo?.dataAge
    || props.remoteInfo?.lastFetched
    || props.remoteInfo?.diagnosis,
  ),
);

const statusLabel = computed(() => {
  const action = isExpanded.value ? "Hide data status details" : "Show data status details";
  return detailsAvailable.value ? `${props.text}. ${action}.` : props.text;
});

const refreshLabel = computed(() => {
  if (props.type === "loading") return "Checking for updates";
  if (props.type === "error") return "Try again";
  return "Refresh data";
});

function handleKeydown(keyboardEvent: KeyboardEvent) {
  if (keyboardEvent.key === "Escape" && isExpanded.value) {
    keyboardEvent.preventDefault();
    handleToggle();
  }
}

function handleClickOutside(mouseEvent: MouseEvent) {
  if (isExpanded.value && statusControl.value && !statusControl.value.contains(mouseEvent.target as Node)) {
    handleToggle();
  }
}

onMounted(() => document.addEventListener("click", handleClickOutside));
onUnmounted(() => document.removeEventListener("click", handleClickOutside));
</script>

<template>
  <div
    ref="statusControl"
    class="status-control"
    :class="[
      `is-${props.type}`,
      {
        'is-expanded': isExpanded,
        'is-compact': (props.compressionStage ?? 0) >= 1,
      },
    ]"
  >
    <button
      v-tactile
      type="button"
      class="status-trigger"
      :class="{ 'is-nominal': props.nominal }"
      :aria-label="statusLabel"
      :aria-expanded="detailsAvailable ? isExpanded : undefined"
      :aria-controls="detailsAvailable ? detailsId : undefined"
      :disabled="!detailsAvailable"
      @click="handleToggle"
      @keydown="handleKeydown"
    >
      <span
        class="status-indicator"
        :class="{ 'is-syncing': props.type === 'loading' }"
        aria-hidden="true"
      >
        <Icon
          v-if="props.type === 'loading'"
          name="loader"
          size="12"
          class="spinner"
        />
        <span
          v-else
          class="status-dot"
        />
      </span>

      <span
        class="status-label technical"
        :class="{ 'is-db': isDB }"
      >{{ displayText }}</span>

      <Icon
        v-if="detailsAvailable"
        name="chevron-down"
        size="14"
        class="status-chevron"
        :class="{ 'is-open': isExpanded }"
        aria-hidden="true"
      />
    </button>

    <Transition name="status-popover">
      <section
        v-if="isExpanded && detailsAvailable"
        :id="detailsId"
        class="status-details"
        aria-label="Data status details"
        role="region"
      >
        <div class="detail-heading">
          <span class="detail-label">Status</span>
          <span class="detail-state">{{ props.text }}</span>
        </div>
        <p class="detail-summary">
          {{ statusSummary }}
        </p>
        <dl class="detail-list">
          <div v-if="displaySource">
            <dt>Source</dt>
            <dd>{{ displaySource }}</dd>
          </div>
          <div v-if="props.remoteInfo?.dataAge">
            <dt>Source snapshot</dt>
            <dd>{{ props.remoteInfo.dataAge }}</dd>
          </div>
          <div v-if="props.remoteInfo?.lastFetched">
            <dt>Last checked</dt>
            <dd>{{ props.remoteInfo.lastFetched }}</dd>
          </div>
          <div
            v-if="props.remoteInfo?.diagnosis"
            class="is-diagnosis"
          >
            <dt>Notice</dt>
            <dd>{{ props.remoteInfo.diagnosis }}</dd>
          </div>
        </dl>
        <button
          v-tactile
          type="button"
          class="status-refresh-action"
          :class="{ 'is-syncing': props.type === 'loading' }"
          :aria-label="refreshLabel"
          :title="refreshLabel"
          :disabled="props.type === 'loading'"
          @click="emit('refresh')"
        >
          <Icon
            :name="props.type === 'loading' ? 'loader' : 'refresh'"
            size="16"
            class="status-refresh-icon"
            aria-hidden="true"
          />
          <span>{{ refreshLabel }}</span>
        </button>
      </section>
    </Transition>
  </div>
</template>

<style scoped>
.status-control {
  position: relative;
  color: var(--sys-color-on-surface-variant);
  z-index: var(--sys-z-dropdown);
  transition: color var(--sys-motion-duration-200) var(--sys-motion-easing-standard);
}

.status-trigger {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sys-space-6);
  /* Visual controls in the summary rail are 32px high. The transparent halo
     below preserves the ADR-required 48px pointer target without making this small status
     token look like a second header row. */
  height: var(--sys-space-32);
  min-height: var(--sys-space-32);
  max-width: 152px;
  padding: 0 var(--sys-space-10);
  border: 1px solid var(--sys-color-outline-variant);
  border-radius: var(--sys-shape-corner-full);
  background: var(--sys-color-surface-container);
  color: inherit;
  cursor: pointer;
  font: inherit;
  transition:
    background-color var(--sys-motion-duration-200) var(--sys-motion-easing-standard),
    border-color var(--sys-motion-duration-200) var(--sys-motion-easing-standard),
    box-shadow var(--sys-motion-duration-200) var(--sys-motion-easing-standard);
}

.status-trigger::after {
  content: "";
  position: absolute;
  inset: calc(-1 * var(--sys-space-8));
}

.status-trigger.is-nominal { background: transparent; }

.status-trigger:not(:disabled):hover {
  background: var(--sys-color-surface-container-high);
  border-color: currentColor;
}

.status-trigger:focus-visible {
  outline: 2px solid var(--sys-color-primary);
  outline-offset: 2px;
}

.status-trigger:disabled { cursor: default; }

.status-indicator {
  position: relative;
  display: inline-flex;
  width: var(--sys-space-12);
  height: var(--sys-space-12);
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}

/* Loading is the only ongoing operation represented by the pill. Its ring
   establishes "working now" at a glance; settled current, stale, and error
   data retain their quieter static dots so status never looks needlessly busy. */
.status-indicator.is-syncing::after {
  content: "";
  position: absolute;
  inset: calc(-1 * var(--sys-space-4));
  border: 1px solid currentColor;
  border-radius: var(--sys-shape-corner-full);
  opacity: 0;
  animation: status-sync-pulse var(--sys-motion-ambient-pulse) var(--sys-motion-easing-standard) infinite;
}

.status-dot {
  width: var(--sys-space-8);
  height: var(--sys-space-8);
  border-radius: var(--sys-shape-corner-full);
  background: currentColor;
  box-shadow:
    0 0 0 var(--sys-space-4) color-mix(in srgb, currentColor 16%, transparent),
    0 1px var(--sys-space-4) color-mix(in srgb, currentColor 24%, transparent);
}

.status-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--sys-color-on-surface);
}

.status-label.is-db { color: var(--sys-color-primary); }

.technical {
  font-family: var(--sys-font-family-mono);
  font-size: var(--sys-typescale-meta);
  font-weight: 750;
  letter-spacing: var(--sys-tracking-wide);
  line-height: var(--sys-leading-none);
  text-transform: uppercase;
}

.status-chevron {
  flex: 0 0 auto;
  color: currentColor;
  transition: transform var(--sys-motion-duration-200) var(--sys-motion-easing-standard);
}

.status-chevron.is-open { transform: rotate(180deg); }

/* Stage 1 removes text before information-bearing color, leaving a compact dot
   with the same accessible name and tap target. The host removes the complete
   status affordance only after its higher-priority title cues are preserved. */
.status-control.is-compact .status-trigger {
  width: var(--sys-space-32);
  min-width: var(--sys-space-32);
  padding: 0;
  border-color: transparent;
  background: transparent;
}

.status-control.is-compact .status-label,
.status-control.is-compact .status-chevron { display: none; }

.is-success { color: var(--sys-color-success); }
.is-warning { color: var(--sys-color-warning); }
.is-error { color: var(--sys-color-error); }
.is-loading { color: var(--sys-color-primary); }

.spinner {
  width: var(--sys-space-12);
  height: var(--sys-space-12);
  animation: rotate var(--sys-motion-ambient-spin) linear infinite;
}

@keyframes status-sync-pulse {
  0%, 100% {
    opacity: 0;
    transform: scale(0.72);
  }
  35% {
    opacity: 0.52;
  }
  70% {
    opacity: 0;
    transform: scale(1.24);
  }
}

.status-details {
  position: absolute;
  top: calc(100% + var(--sys-space-8));
  right: 0;
  width: min(288px, calc(100vw - var(--sys-space-48)));
  padding: var(--sys-space-14);
  border: 1px solid var(--sys-surface-glass-border);
  border-radius: var(--sys-shape-corner-medium);
  background: var(--sys-surface-glass);
  backdrop-filter: var(--sys-surface-glass-blur);
  -webkit-backdrop-filter: var(--sys-surface-glass-blur);
  box-shadow: var(--sys-elevation-3);
  color: var(--sys-color-on-surface);
}

.detail-heading,
.detail-list > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sys-space-12);
}

.detail-heading {
  padding-bottom: var(--sys-space-10);
  border-bottom: 1px solid var(--sys-color-outline-variant);
}

.detail-summary {
  margin: var(--sys-space-10) 0 0;
  color: var(--sys-color-on-surface-variant);
  font-size: var(--sys-typescale-meta);
  line-height: var(--sys-leading-normal);
}

.detail-label,
.detail-list dt {
  color: var(--sys-color-on-surface-variant);
  font-size: var(--sys-typescale-meta);
  font-weight: 700;
}

.detail-state,
.detail-list dd {
  margin: 0;
  min-width: 0;
  font-family: var(--sys-font-family-mono);
  font-size: var(--sys-typescale-meta);
  font-weight: 750;
  text-align: right;
}

.detail-list {
  display: grid;
  gap: var(--sys-space-8);
  margin: var(--sys-space-12) 0 0;
}

.detail-list .is-diagnosis {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
}

.detail-list .is-diagnosis dd {
  color: var(--sys-color-warning);
  line-height: var(--sys-leading-normal);
  overflow-wrap: anywhere;
  text-align: left;
}
.is-error .detail-list .is-diagnosis dd { color: var(--sys-color-error); }

/* Refresh belongs with data provenance, not in the always-visible title rail.
   It uses the real connectivity state supplied by the host: an idle refresh
   glyph invites a check; the only rotation is the active request itself. */
.status-refresh-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sys-space-8);
  width: 100%;
  min-height: var(--sys-space-48);
  margin-top: var(--sys-space-14);
  padding: 0 var(--sys-space-12);
  border: 1px solid var(--sys-color-outline-variant);
  border-radius: var(--sys-shape-corner-small);
  background: var(--sys-color-surface-container-high);
  color: var(--sys-color-on-surface);
  cursor: pointer;
  font: inherit;
  font-size: var(--sys-typescale-meta);
  font-weight: 750;
  transition:
    background-color var(--sys-motion-duration-200) var(--sys-motion-easing-standard),
    border-color var(--sys-motion-duration-200) var(--sys-motion-easing-standard),
    color var(--sys-motion-duration-200) var(--sys-motion-easing-standard),
    transform var(--sys-motion-duration-200) var(--sys-motion-spring);
}

.status-refresh-action:hover:not(:disabled) {
  border-color: var(--sys-color-primary);
  background: var(--sys-color-primary-container);
  color: var(--sys-color-on-primary-container);
  transform: translateY(calc(-1 * var(--sys-space-1)));
}

.status-refresh-action:active:not(:disabled) { transform: scale(0.98); }

.status-refresh-action:focus-visible {
  outline: 2px solid var(--sys-color-primary);
  outline-offset: 2px;
}

.status-refresh-action:disabled {
  cursor: progress;
  opacity: 0.78;
}

.status-refresh-icon.is-syncing { animation: rotate var(--sys-motion-ambient-spin) linear infinite; }

.status-popover-enter-active,
.status-popover-leave-active {
  transition:
    opacity var(--sys-motion-duration-200) var(--sys-motion-easing-standard),
    transform var(--sys-motion-duration-200) var(--sys-motion-easing-standard);
}

.status-popover-enter-from,
.status-popover-leave-to {
  opacity: 0;
  transform: translateY(calc(-1 * var(--sys-space-4)));
}

@keyframes rotate { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  :global(html:not([data-motion-preference="standard"])) .spinner,
  :global(html:not([data-motion-preference="standard"])) .status-indicator.is-syncing::after,
  :global(html:not([data-motion-preference="standard"])) .status-refresh-icon.is-syncing {
    animation: none;
  }

  :global(html:not([data-motion-preference="standard"])) .status-indicator.is-syncing::after {
    opacity: 0.45;
    transform: none;
  }

  :global(html:not([data-motion-preference="standard"])) .status-refresh-action:hover:not(:disabled),
  :global(html:not([data-motion-preference="standard"])) .status-refresh-action:active:not(:disabled) { transform: none; }
}

:global(html[data-motion-preference="reduced"]) .spinner,
:global(html[data-motion-preference="reduced"]) .status-indicator.is-syncing::after,
:global(html[data-motion-preference="reduced"]) .status-refresh-icon.is-syncing { animation: none; }
:global(html[data-motion-preference="reduced"]) .status-indicator.is-syncing::after { opacity: 0.45; transform: none; }
:global(html[data-motion-preference="reduced"]) .status-refresh-action:hover:not(:disabled),
:global(html[data-motion-preference="reduced"]) .status-refresh-action:active:not(:disabled) { transform: none; }
</style>
