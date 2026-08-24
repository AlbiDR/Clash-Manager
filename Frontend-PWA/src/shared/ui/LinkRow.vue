<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
/**
 * COMPONENT: LinkRow
 * ----------------------------------------------------------------------------
 * Rationale: Standardized outbound-link row used by every Settings module that
 * presents a list of external destinations (Useful Links, About).
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 2 (@shared) - domain-blind, stateless. Owns presentation only;
 *   the caller owns navigation and therefore the `click` contract.
 * - **Satisfaction:** ADR Section I (Deduplication, Componentization, SSOT) and
 *   ADR Section V (A11y: 48px minimum touch footprint).
 *
 * [DECISION LOG] Extracted after a second consumer appeared. Two components carrying
 * byte-identical row markup and ~70 lines of duplicated CSS is the exact drift vector
 * the ADR's deduplication rule exists to prevent: a token change applied to one copy
 * and not the other silently desynchronises the Settings view. Class names are
 * preserved verbatim from the original UsefulLinksSettings markup so the extraction is
 * a pure refactor with no visual delta and no test churn.
 *
 * [DECISION LOG] Renders a `<button>`, not an `<a>`. These destinations are opened
 * through the Layer 2 `useExternalLink` broker so the native Android wrapper can
 * intercept them; a bare href would escape that brokering.
 */
import Icon from "./Icon.vue";
import { vTactile } from "../directives/vTactile";

defineProps<{
  /** Primary destination name. */
  label: string;

  /** Supporting subtitle describing what the destination offers. */
  description?: string;

  /** Icon name resolved through the Icon.vue primitive. Ignored when `logo` is set. */
  icon?: string;

  /** Remote brand image URL. Takes precedence over `icon` when present. */
  logo?: string;

  /** Applies disabled styling and blocks pointer events. */
  disabled?: boolean;
}>();

defineEmits<{
  /**
   * Activation event. Named `emitEvent` to satisfy the ADR Section VII naming
   * contract on the callback boundary.
   */
  (emitEvent: "click"): void;
}>();
</script>

<template>
  <button
    v-tactile
    type="button"
    class="link-row"
    :class="{ disabled: disabled }"
    @click="!disabled && $emit('click')"
  >
    <div class="link-info">
      <span class="link-label">{{ label }}</span>
      <span
        v-if="description"
        class="link-desc"
      >{{ description }}</span>
    </div>
    <img
      v-if="logo"
      :src="logo"
      class="link-logo"
      :alt="label"
      width="18"
      height="18"
      loading="lazy"
    >
    <Icon
      v-else-if="icon"
      :name="icon"
      size="18"
      class="link-icon"
    />
  </button>
</template>

<style scoped>
.link-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  /* button resets */
  appearance: none;
  background: none;
  border: none;
  font: inherit;
  color: inherit;
  text-align: left;
  /* shared */
  text-decoration: none;
  cursor: pointer;
  min-height: var(--sys-space-48); /* 48px Mobile Footprint (Target B.2) */
  padding: var(--sys-space-4) 0; /* Compensating vertical padding */
  user-select: none; /* Text Selection Containment (Target A.3) */
  -webkit-user-select: none;
  transition: all var(--sys-motion-duration-200) var(--sys-motion-spring);
}

.link-row:not(.disabled):active {
  transform: scale(0.98);
}

.link-row.disabled {
  pointer-events: none;
  opacity: 0.5;
}

.link-info {
  display: flex;
  flex-direction: column;
  gap: var(--sys-space-4);
  flex: 1;
}

.link-label {
  font-weight: 800;
  font-size: var(--sys-typescale-body-rg);
  color: var(--sys-color-on-surface);
  transition: color 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.link-desc {
  font-size: var(--sys-typescale-body-sm);
  color: var(--sys-color-outline);
  opacity: 0.8;
}

.link-icon {
  color: var(--sys-color-outline);
  opacity: 0.6;
  transition: opacity 0.25s, color 0.25s;
}

.link-row:hover .link-icon {
  color: var(--sys-color-primary);
  opacity: 1;
}

.link-logo {
  width: 18px;
  height: 18px;
  object-fit: contain;
  filter: grayscale(1) opacity(0.6);
  transition: opacity 0.25s, filter 0.25s;
}

.link-row:hover .link-logo {
  filter: grayscale(0) opacity(1);
}
</style>
