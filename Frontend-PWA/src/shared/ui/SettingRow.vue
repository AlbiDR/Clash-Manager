<script setup lang="ts">
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * COMPONENT: SettingRow
 *
 * @remarks
 * A standardized row for application settings, typically containing a label,
 * a description, and a toggle switch.
 */

defineProps<{
  label?: string;
  description?: string;
  active?: boolean;
  disabled?: boolean;
  loading?: boolean;
  mini?: boolean;
}>();

defineEmits<{
  (e: 'click'): void;
}>();
</script>

<template>
  <div
    class="setting-row"
    :class="{
      'active-row': active,
      'mini': mini,
      'disabled': disabled
    }"
    @click="!disabled && $emit('click')"
  >
    <div class="row-info">
      <div class="row-label">
        <slot name="label">{{ label }}</slot>
      </div>
      <div class="row-desc">
        <slot name="description">{{ description }}</slot>
      </div>
    </div>
    <div
      class="switch"
      :class="{
        active: active,
        'skeleton-anim sk-badge-s': loading,
      }"
    >
      <div class="handle"></div>
    </div>
  </div>
</template>

<style scoped>
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  transition: all 0.2s var(--sys-motion-standard);
}

.setting-row.disabled {
  pointer-events: none;
  opacity: 0.5;
}

.row-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.row-label {
  font-weight: 800;
  font-size: 15px;
  color: var(--sys-color-outline);
  opacity: 0.5;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
}

.row-desc {
  font-size: 13px;
  opacity: 0.5;
  color: var(--sys-color-outline);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.setting-row.active-row .row-label {
  color: var(--sys-color-on-surface);
  opacity: 1;
}

.setting-row.active-row .row-desc {
  color: var(--sys-color-on-surface);
  opacity: 0.8;
}

/* Switch Styles */
.switch {
  width: 44px;
  height: 24px;
  background: var(--sys-color-surface-container-highest);
  border-radius: 12px;
  position: relative;
  transition: 0.3s;
  border: 1.5px solid rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
}

.switch.active {
  background: var(--sys-color-primary);
  border-color: var(--sys-color-primary);
}

.switch .handle {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 17px;
  height: 17px;
  background: white;
  border-radius: 50%;
  transition: 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
}

.switch.active .handle {
  left: calc(100% - 19px);
}

/* Mini Variant */
.setting-row.mini {
  padding-left: 8px;
  margin-bottom: -4px;
}

.setting-row.mini .row-label {
  font-size: 14px;
  font-weight: 700;
}

.setting-row.mini .row-desc {
  font-size: 12px;
}

.setting-row.mini .switch {
  transform: scale(0.85);
}

/* Skeleton animation if loading */
.sk-badge-s {
  border: none !important;
}
</style>
