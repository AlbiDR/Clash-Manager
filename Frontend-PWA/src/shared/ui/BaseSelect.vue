<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts" generic="T extends string | number">
import { computed, ref, useId, useTemplateRef, onMounted, onUnmounted } from "vue";
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
  /** The array of option contracts of type Option<T>. */
  options: Option<T>[];
  /** The default fallback placeholder text. */
  placeholder?: string;
  /** Accessibility label for screen-readers. */
  ariaLabel?: string;
}>();

/** The active selected value of type T. */
const modelValue = defineModel<T>({ required: true });

const isOpen = ref(false);
const selectRef = useTemplateRef<HTMLElement>("selectRef");
const triggerRef = useTemplateRef<HTMLButtonElement>("triggerRef");

const listboxId = useId();

/**
 * Index of the option the keyboard is currently on.
 *
 * @remarks
 * [DECISION LOG] A ROVING POINTER, NOT ROVING FOCUS:
 * This component documented itself as "a keyboard-accessible replacement for
 * native HTML select" and implemented no keyboard interaction beyond opening.
 * The options were non-focusable list items carrying only a click handler, so
 * anyone arriving by keyboard could open the menu and then had no way to choose
 * an option or to close it again. The sort control on every console is this
 * component.
 *
 * Focus stays on the trigger and `aria-activedescendant` points at the current
 * option, which is the combobox pattern. Moving real focus into the list would
 * fight the outside-click handler and lose the trigger's own key bindings.
 */
const activeIndex = ref(-1);

/** Index of the currently selected option, or -1 when nothing matches. */
const selectedIndex = computed(() =>
  props.options.findIndex((option) => option.value === modelValue.value),
);

/** DOM id of the active option, for `aria-activedescendant`. */
const activeDescendantId = computed(() =>
  isOpen.value && activeIndex.value >= 0 ? `${listboxId}-${activeIndex.value}` : undefined,
);

/**
 * Finds the next selectable option, skipping disabled ones.
 *
 * @param from - Index to start from.
 * @param step - Direction to walk, 1 or -1.
 * @returns The next enabled index, or the original when none exists.
 */
function nextEnabledIndex(from: number, step: number): number {
  for (let offset = 1; offset <= props.options.length; offset++) {
    const candidate = from + step * offset;
    if (candidate < 0 || candidate >= props.options.length) break;
    if (!props.options[candidate]?.disabled) return candidate;
  }
  return from;
}

/** Opens the list with the highlight on the current selection. */
function openDropdown(): void {
  isOpen.value = true;
  activeIndex.value = selectedIndex.value >= 0
    ? selectedIndex.value
    : nextEnabledIndex(-1, 1);
}

/** Closes the list and returns focus to the trigger. */
function closeDropdown(): void {
  isOpen.value = false;
  activeIndex.value = -1;
  triggerRef.value?.focus();
}

const toggleDropdown = () => {
  if (isOpen.value) closeDropdown();
  else openDropdown();
};

const selectOption = (option: Option<T>) => {
  if (option.disabled) return;
  modelValue.value = option.value;
  closeDropdown();
};

/**
 * The listbox keyboard contract, handled on the trigger.
 *
 * @param keyboardEvent - The originating keyboard event.
 */
function handleKeyDown(keyboardEvent: KeyboardEvent): void {
  const { key } = keyboardEvent;

  if (!isOpen.value) {
    // Space and Enter already activate a native button, which toggles the list.
    if (key === "ArrowDown" || key === "ArrowUp") {
      keyboardEvent.preventDefault();
      openDropdown();
    }
    return;
  }

  if (key === "Escape") {
    keyboardEvent.preventDefault();
    closeDropdown();
    return;
  }

  if (key === "Enter" || key === " ") {
    keyboardEvent.preventDefault();
    const option = props.options[activeIndex.value];
    if (option) selectOption(option);
    return;
  }

  if (key === "ArrowDown" || key === "ArrowUp") {
    keyboardEvent.preventDefault();
    activeIndex.value = nextEnabledIndex(activeIndex.value, key === "ArrowDown" ? 1 : -1);
    return;
  }

  if (key === "Home" || key === "End") {
    keyboardEvent.preventDefault();
    activeIndex.value = key === "Home"
      ? nextEnabledIndex(-1, 1)
      : nextEnabledIndex(props.options.length, -1);
  }
}

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
  const selected = props.options.find((option) => option.value === modelValue.value);
  return selected ? selected.label : props.placeholder || "Select...";
};
</script>

<template>
  <div
    ref="selectRef"
    class="custom-select"
  >
    <button
      ref="triggerRef"
      v-tactile
      type="button"
      class="select-trigger"
      :aria-label="props.ariaLabel"
      :aria-expanded="isOpen"
      aria-haspopup="listbox"
      :aria-controls="listboxId"
      :aria-activedescendant="activeDescendantId"
      @click="toggleDropdown"
      @keydown="handleKeyDown"
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
          :id="listboxId"
          role="listbox"
          class="options-list"
        >
          <li
            v-for="(option, optionIndex) in props.options"
            :id="`${listboxId}-${optionIndex}`"
            :key="option.value"
            v-tactile
            role="option"
            :aria-selected="option.value === modelValue"
            :aria-disabled="option.disabled ? 'true' : undefined"
            class="option-item"
            :class="[
              option.class || '',
              {
                active: option.value === modelValue,
                'is-keyboard-active': optionIndex === activeIndex,
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

/* The row the keyboard is on. Distinct from `.active`, which marks the current
   selection: while arrowing, the two are usually different rows and a reader
   has to be able to tell which one Enter will take. */
.option-item.is-keyboard-active {
  outline: 2px solid var(--sys-color-primary);
  outline-offset: calc(-1 * var(--sys-space-2));
}

.select-trigger {
  width: 100%;
  height: 48px;
  padding: 0 14px;
  padding-right: 36px;
  background: var(--sys-color-surface-container);
  border: 1px solid rgba(128, 128, 128, 0.15);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
  border-radius: var(--sys-shape-corner-input);
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--sys-color-on-surface);
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
  color: var(--sys-color-outline);
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
  border-radius: var(--sys-shape-corner-input);
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
