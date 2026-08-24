<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts" generic="T extends string | number">
import { ref, onMounted, onUnmounted } from "vue";
import { vTactile } from "../directives/vTactile";
import Icon from "./Icon.vue";

/**
 * SHARED UI: BaseSelect (Layer 2)
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 2 (@shared/ui)
 * - **Role:** Presentation. Provides a clinical, keyboard-accessible replacement
 *   for native HTML <select> elements in Android WebViews. Modernized to use
 *   v-tactile for declarative haptic brokering.
 *
 * [DECISION LOG] Transitioned to generic <T> to eliminate 'any' pathogens
 * in value handling. Renamed anemic 'o' to 'option' for domain clarity.
 */

/**
 * Interface contract for select options.
 *
 * @typeParam V - The type of value stored in the option.
 */
interface Option<V> {
  /** The display text for the option. */
  label: string;
  /** The underlying raw value of the option. */
  value: V;
  /** Whether this option is disabled and cannot be selected. */
  disabled?: boolean;
  /** Custom CSS classes to apply to this option. */
  class?: string;
}

/**
 * Component-level properties for BaseSelect.
 */
const props = defineProps<{
  /** The active selected value of type T. */
  modelValue: T;
  /** The array of option contracts of type Option<T>. */
  options: Option<T>[];
  /** The default fallback placeholder text. */
  placeholder?: string;
  /** Accessibility label for screen-readers. */
  ariaLabel?: string;
}>();

/**
 * Component-level custom event emissions.
 */
const emit = defineEmits<{
  /** Emitted when an option selection changes. */
  "update:modelValue": [T];
}>();

const isOpen = ref(false);
const selectRef = ref<HTMLElement | null>(null);

const toggleDropdown = () => {
  isOpen.value = !isOpen.value;
};

const selectOption = (option: Option<T>) => {
  if (option.disabled) return;
  // [THREAT:] Emitting unvalidated 'any' values can corrupt higher-layer state.
  // [DECISION LOG] Generics ensure that the emitted value strictly matches the T type.
  emit("update:modelValue", option.value);
  isOpen.value = false;
};

const handleClickOutside = (event: MouseEvent) => {
  if (selectRef.value && !selectRef.value.contains(event.target as Node)) {
    isOpen.value = false;
  }
};

onMounted(() => {
  document.addEventListener("click", handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
});

const getSelectedLabel = () => {
  // [DECISION LOG] Renaming anemic pathogen 'o' to 'option'.
  const selected = props.options.find((option) => option.value === props.modelValue);
  return selected ? selected.label : props.placeholder || "Select...";
};
</script>

<template>
  <div
    ref="selectRef"
    class="custom-select"
  >
    <button
      v-tactile
      type="button"
      class="select-trigger"
      :aria-label="props.ariaLabel"
      :aria-expanded="isOpen"
      @click="toggleDropdown"
    >
      <span class="trigger-label">{{ getSelectedLabel() }}</span>
      <Icon
        name="chevron-down"
        size="14"
        class="select-chevron"
        :class="{ 'is-open': isOpen }"
      />
    </button>

    <Transition name="fade-slide">
      <div
        v-if="isOpen"
        class="options-dropdown"
      >
        <ul
          role="listbox"
          class="options-list"
        >
          <li
            v-for="option in props.options"
            :key="option.value"
            v-tactile
            role="option"
            :aria-selected="option.value === props.modelValue"
            class="option-item"
            :class="[
              option.class || '',
              {
                active: option.value === props.modelValue,
                disabled: option.disabled
              }
            ]"
            @click="selectOption(option)"
          >
            {{ option.label }}
          </li>
        </ul>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.custom-select {
  position: relative;
  width: 100%;
}

.select-trigger {
  width: 100%;
  height: 48px;
  padding: 0 14px;
  padding-right: 36px;
  background: var(--sys-surf-c, var(--sys-color-surface-container));
  border: 1px solid rgba(128, 128, 128, 0.15);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--sys-text-secondary, var(--sys-color-on-surface));
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  outline: none;
  text-align: left;
  transition: border-color 0.2s var(--sys-motion-spring);
}

.select-trigger:focus-visible {
  border-color: var(--sys-color-primary);
}

.trigger-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.select-chevron {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--sys-text-tertiary, var(--sys-color-outline));
  transition: transform 0.2s var(--sys-motion-spring);
}

.select-chevron.is-open {
  transform: translateY(-50%) rotate(180deg);
}

.options-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--sys-surface-glass, var(--sys-color-surface-container-high));
  backdrop-filter: var(--sys-surface-glass-blur);
  -webkit-backdrop-filter: var(--sys-surface-glass-blur);
  border: 1px solid var(--sys-surface-glass-border, var(--sys-color-outline-variant));
  border-radius: 12px;
  box-shadow: var(--sys-elevation-3);
  z-index: 110;
  overflow: hidden;
}

.options-list {
  max-height: 240px;
  overflow-y: auto;
  padding: 6px;
  margin: 0;
  list-style: none;
  scrollbar-width: thin;
  scrollbar-color: var(--sys-color-outline-variant) transparent;
}

.options-list::-webkit-scrollbar {
  width: 4px;
}

.options-list::-webkit-scrollbar-thumb {
  background: var(--sys-color-outline-variant);
  border-radius: 99px;
}

.option-item {
  padding: 14px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--sys-color-on-surface);
  cursor: pointer;
  transition: all 0.15s var(--sys-motion-spring);
}

.option-item:hover:not(.disabled) {
  background: rgba(var(--sys-color-primary-rgb), 0.08);
  color: var(--sys-color-primary);
}

.option-item.active {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
}

.option-item.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Support for custom semantic classes from parents */
.option-item.milestone {
  font-weight: 900;
  color: var(--sys-color-primary);
}

.option-item.past {
  opacity: 0.5;
}

/* Animations */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity 0.2s var(--sys-motion-spring),
              transform 0.2s var(--sys-motion-spring);
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
