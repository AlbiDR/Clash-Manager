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
}>();

const { isExpanded, isDB, displayText, displaySource, handleToggle } = useStatusPill(props);
const detailsId = useId();
const statusControl = useTemplateRef<HTMLElement>("statusControl");

const detailsAvailable = computed(() =>
  props.type !== "loading" && Boolean(displaySource.value || props.remoteInfo?.dataAge || props.remoteInfo?.diagnosis),
);

const statusLabel = computed(() => {
  const action = isExpanded.value ? "Hide connection details" : "Show connection details";
  return detailsAvailable.value ? `${props.text}. ${action}.` : props.text;
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
    :class="[`is-${props.type}`, { 'is-expanded': isExpanded }]"
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
        aria-hidden="true"
      >
        <svg
          v-if="props.type === 'loading'"
          class="spinner"
          viewBox="0 0 24 24"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
          />
        </svg>
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
        aria-label="Connection details"
        role="status"
      >
        <div class="detail-heading">
          <span class="detail-label">Connection</span>
          <span class="detail-state">{{ props.text }}</span>
        </div>
        <dl class="detail-list">
          <div v-if="displaySource">
            <dt>Source</dt>
            <dd>{{ displaySource }}</dd>
          </div>
          <div v-if="props.remoteInfo?.dataAge">
            <dt>Data age</dt>
            <dd>{{ props.remoteInfo.dataAge }}</dd>
          </div>
          <div
            v-if="props.remoteInfo?.diagnosis"
            class="is-diagnosis"
          >
            <dt>Notice</dt>
            <dd>{{ props.remoteInfo.diagnosis }}</dd>
          </div>
        </dl>
      </section>
    </Transition>
  </div>
</template>

<style scoped>
.status-control {
  position: relative;
  color: var(--sys-color-on-surface-variant);
  z-index: var(--sys-z-dropdown);
}

.status-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sys-space-6);
  min-height: 44px;
  max-width: 152px;
  padding: 0 var(--sys-space-10);
  border: 1px solid var(--sys-color-outline-variant);
  border-radius: var(--sys-shape-corner-full);
  background: var(--sys-color-surface-container);
  color: inherit;
  cursor: pointer;
  font: inherit;
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
  display: inline-flex;
  width: var(--sys-space-12);
  height: var(--sys-space-12);
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}

.status-dot {
  width: var(--sys-space-8);
  height: var(--sys-space-8);
  border-radius: var(--sys-shape-corner-full);
  background: currentColor;
  box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 16%, transparent);
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

.is-success { color: var(--sys-color-success); }
.is-warning { color: var(--sys-color-warning); }
.is-error { color: var(--sys-color-error); }
.is-loading { color: var(--sys-color-primary); }

.spinner {
  width: var(--sys-space-12);
  height: var(--sys-space-12);
  animation: rotate var(--sys-motion-ambient-spin) linear infinite;
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

.detail-label,
.detail-list dt {
  color: var(--sys-color-on-surface-variant);
  font-size: var(--sys-typescale-meta);
  font-weight: 700;
}

.detail-state,
.detail-list dd {
  margin: 0;
  font-family: var(--sys-font-family-mono);
  font-size: var(--sys-typescale-meta);
  font-weight: 750;
  text-align: right;
}

.detail-list {
  display: grid;
  gap: var(--sys-space-8);
  margin: var(--sys-space-10) 0 0;
}

.detail-list .is-diagnosis { align-items: start; }
.detail-list .is-diagnosis dd { color: var(--sys-color-warning); }
.is-error .detail-list .is-diagnosis dd { color: var(--sys-color-error); }

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
</style>
