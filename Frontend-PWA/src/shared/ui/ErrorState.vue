<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { computed } from "vue";
import { useClipboard } from "../composables/useClipboard";
import { vTactile } from "../directives/vTactile";
import Icon from "./Icon.vue";

const props = defineProps<{
  /** Human-readable name of the surface that could not be loaded. */
  title?: string;
  /** Classified, reader-safe sync failure supplied by Layer 1. */
  message: string;
}>();

defineEmits<{
  retry: [];
}>();

const { clipboardState, copyText } = useClipboard();

const errorHeading = computed(() => `Couldn't load ${props.title || "this view"}`);
const copyLabel = computed(() => {
  if (clipboardState.value === "copied") return "Copied";
  if (clipboardState.value === "unavailable") return "Copy unavailable";
  return "Copy details";
});

function handleCopyDetails() {
  void copyText(props.message);
}
</script>

<template>
  <section
    class="error-state"
    role="alert"
    aria-live="assertive"
  >
    <div
      class="error-icon-box"
      aria-hidden="true"
    >
      <Icon
        name="warning"
        size="32"
      />
    </div>

    <div class="error-copy">
      <p class="error-eyebrow">
        SYNC NEEDS ATTENTION
      </p>
      <h2 class="error-heading">
        {{ errorHeading }}
      </h2>
      <p class="error-message">
        {{ props.message }}
      </p>
    </div>

    <div class="error-actions">
      <button
        v-tactile
        type="button"
        class="error-action error-action--primary"
        @click="$emit('retry')"
      >
        <Icon
          name="refresh"
          size="18"
          aria-hidden="true"
        />
        <span>Try again</span>
      </button>
      <button
        v-tactile
        type="button"
        class="error-action error-action--secondary"
        :class="{
          'is-copied': clipboardState === 'copied',
          'is-unavailable': clipboardState === 'unavailable',
        }"
        :aria-label="copyLabel"
        :title="copyLabel"
        @click="handleCopyDetails"
      >
        <Icon
          :name="clipboardState === 'copied' ? 'check' : 'copy'"
          size="18"
          aria-hidden="true"
        />
        <span>{{ copyLabel }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.error-state {
  display: grid;
  justify-items: center;
  gap: var(--sys-space-16);
  margin: var(--sys-space-20) 0;
  padding: var(--sys-space-40) var(--sys-space-24);
  border: 1px solid var(--sys-color-outline-variant);
  border-radius: var(--sys-shape-corner-extra-large);
  background: var(--sys-surface-glass);
  box-shadow: var(--sys-elevation-3);
  color: var(--sys-color-on-surface);
  text-align: center;
}

.error-icon-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--sys-space-56);
  height: var(--sys-space-56);
  border-radius: var(--sys-shape-corner-medium);
  background: var(--sys-color-error-container);
  color: var(--sys-color-error);
}

.error-copy {
  display: grid;
  gap: var(--sys-space-6);
  max-width: 52ch;
}

.error-eyebrow {
  margin: 0;
  color: var(--sys-color-error);
  font-family: var(--sys-font-family-mono);
  font-size: var(--sys-typescale-label-xs);
  font-weight: 800;
  letter-spacing: var(--sys-tracking-wide);
  line-height: var(--sys-leading-none);
}

.error-heading {
  margin: 0;
  color: var(--sys-color-on-surface);
  font-size: var(--sys-typescale-title-sm);
  font-weight: 850;
  line-height: var(--sys-leading-tight);
}

.error-message {
  margin: 0;
  color: var(--sys-color-on-surface-variant);
  font-size: var(--sys-typescale-body-sm);
  line-height: var(--sys-leading-normal);
  overflow-wrap: anywhere;
  user-select: text;
  white-space: pre-wrap;
}

.error-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--sys-space-8);
}

.error-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sys-space-8);
  min-height: var(--sys-space-48);
  padding: 0 var(--sys-space-16);
  border-radius: var(--sys-shape-corner-full);
  cursor: pointer;
  font: inherit;
  font-weight: 800;
}

.error-action--primary {
  border: 1px solid transparent;
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  box-shadow: var(--sys-elevation-2);
}

.error-action--secondary {
  border: 1px solid var(--sys-color-outline-variant);
  background: var(--sys-color-surface-container-high);
  color: var(--sys-color-on-surface);
  transition:
    background-color var(--sys-motion-duration-200) var(--sys-motion-easing-standard),
    border-color var(--sys-motion-duration-200) var(--sys-motion-easing-standard),
    color var(--sys-motion-duration-200) var(--sys-motion-easing-standard),
    transform var(--sys-motion-duration-200) var(--sys-motion-spring);
}

.error-action--secondary.is-copied {
  background: var(--sys-color-primary);
  border-color: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
}

.error-action--secondary.is-unavailable {
  color: var(--sys-color-error);
}

.error-action:hover { transform: translateY(calc(-1 * var(--sys-space-2))); }

.error-action:focus-visible {
  outline: 2px solid var(--sys-color-primary);
  outline-offset: 2px;
}

@media (max-width: 360px) {
  .error-state {
    margin: var(--sys-space-16) 0;
    padding: var(--sys-space-32) var(--sys-space-16);
  }

  .error-actions {
    width: 100%;
  }

  .error-action {
    flex: 1 1 0;
    min-width: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .error-action:hover { transform: none; }
}
</style>
