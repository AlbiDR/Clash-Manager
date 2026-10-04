<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useId, useTemplateRef, watch } from "vue";
import { useSearchField } from "../composables/useSearchField";
import { vTactile } from "../directives/vTactile";
import Icon from "./Icon.vue";

/**
 * SHARED UI: View Options (Layer 2)
 *
 * A domain-blind home for the secondary ways a reader shapes a list. Search
 * and order are consequential when used, but are not consequential enough to
 * permanently claim a row of a console. It always opens as the same bottom
 * sheet, so keyboard, touch, and pointer users learn one dependable rhythm.
 *
 * @remarks
 * Satisfies ADR Section II: Shared UI Component Contracts and ADR Section IV: Mobile Hybrid Shell.
 *
 * @public
 */
export interface ViewSortOption {
  /** Display label for the sorting option in selector UI. */
  label: string;
  /** Unique domain identifier or field key for sort ordering. */
  value: string;
  /** Short descriptive subtext for list display. */
  desc?: string;
  /** Comprehensive descriptive explanation for accessible or detail modes. */
  fullDesc?: string;
}

/**
 * Component Props Contract for ViewOptions.
 *
 * @remarks
 * Manages presentation state, bottom sheet visibility, search term query binding,
 * and sort options configuration.
 */
interface ViewOptionsProps {
  /** Short, human-readable name of the view being shaped (e.g., "Roster", "Recruits"). */
  title: string;
  /** Visibility state controlling whether the bottom sheet overlay is open. */
  open: boolean;
  /** Joins the console's primary Select/Done action as a compact segment. */
  embedded?: boolean;
  /** Whether search input field is active for the current view. */
  showSearch?: boolean;
  /** Reactive query string for active view filter. */
  searchQuery?: string;
  /** Available sorting criteria definitions. */
  sortOptions?: ViewSortOption[];
  /** Currently selected sort option value key. */
  currentSort?: string;
}

const props = defineProps<ViewOptionsProps>();

const emit = defineEmits<{
  /** Emitted when bottom sheet open/close state toggles. */
  "update:open": [boolean];
  /** Emitted when search query text input updates. */
  "update:search": [string];
  /** Emitted when a new sort option value is selected. */
  "update:sort": [string];
}>();

const triggerRef = useTemplateRef<HTMLButtonElement>("triggerRef");
const panelRef = useTemplateRef<HTMLElement>("panelRef");
const searchInput = useTemplateRef<HTMLInputElement>("searchInput");
const panelId = useId();
let previouslyFocused: HTMLElement | null = null;
const dragOffset = ref(0);
const isDragging = ref(false);
let dragStartY = 0;
let didDrag = false;

const defaultSortValue = computed(() => props.sortOptions?.[0]?.value ?? "");
const activeSort = computed(() =>
  props.sortOptions?.find((sortOption) => sortOption.value === props.currentSort)
  ?? props.sortOptions?.[0],
);
const hasSearchQuery = computed(() => (props.searchQuery ?? "").trim().length > 0);
const isModified = computed(() =>
  hasSearchQuery.value
  || (!!props.currentSort && props.currentSort !== defaultSortValue.value),
);
const accessibleState = computed(() => {
  const changes: string[] = [];
  if (hasSearchQuery.value) changes.push("search active");
  if (props.currentSort && props.currentSort !== defaultSortValue.value) {
    changes.push(`sorted by ${activeSort.value?.label ?? "a custom order"}`);
  }
  return changes.length > 0 ? `, ${changes.join("; ")}` : "";
});

const {
  clearSearchField,
  handleSearchInput,
  handleSearchKeydown,
} = useSearchField({
  readQuery: () => props.searchQuery ?? "",
  onQueryChange: (query) => emit("update:search", query),
  focusInput: () => searchInput.value?.focus(),
});

/**
 * Initiates drag gesture on bottom sheet handle.
 *
 * @param touchEvent - Native touch start event payload.
 */
function beginSheetDrag(touchEvent: TouchEvent): void {
  // Capture initial Y coordinate for vertical translation tracking
  dragStartY = touchEvent.touches[0]?.clientY ?? 0;
  didDrag = false;
  isDragging.value = true;
}

/**
 * Tracks vertical drag displacement during sheet swipe down.
 *
 * @param touchEvent - Native touch move event payload.
 */
function trackSheetDrag(touchEvent: TouchEvent): void {
  if (!isDragging.value) return;
  const currentY = touchEvent.touches[0]?.clientY ?? dragStartY;
  // Restrict translation offset to downward movement only
  dragOffset.value = Math.max(0, currentY - dragStartY);
  didDrag = dragOffset.value > 0;
}

/**
 * Concludes drag gesture and determines sheet dismissal threshold.
 *
 * @remarks
 * THREAT: Preventing accidental dismissals during minor touch jitter.
 * Requiring a minimum 80px downward drag before triggering sheet dismissal.
 */
function finishSheetDrag(): void {
  if (!isDragging.value) return;
  isDragging.value = false;
  // Threshold dismissal at 80px downward swipe
  if (dragOffset.value > 80) closeOptions();
  dragOffset.value = 0;
}

/**
 * Handles click on bottom sheet handle, distinguishing explicit taps from drag gestures.
 */
function handleSheetHandleClick(): void {
  // Ignore handle tap if event was initiated as part of a drag gesture
  if (didDrag) {
    didDrag = false;
    return;
  }
  closeOptions();
}

/**
 * Opens bottom sheet dialog overlay or toggles state if already open.
 */
function openOptions(): void {
  if (props.open) {
    closeOptions();
    return;
  }
  // Store trigger or currently active element for focus restoration on sheet dismissal
  previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  emit("update:open", true);
}

/**
 * Closes bottom sheet dialog overlay.
 */
function closeOptions(): void {
  if (!props.open) return;
  emit("update:open", false);
}

/**
 * Selects a sort criteria option and dismisses bottom sheet.
 *
 * @param sortValue - Selected sort key value string.
 */
function selectSort(sortValue: string): void {
  // Only emit update if value differs from current sort
  if (sortValue !== props.currentSort) emit("update:sort", sortValue);
  closeOptions();
}

/**
 * Resets search filter query and sort criteria back to default initial values.
 */
function resetOptions(): void {
  if (hasSearchQuery.value) clearSearchField();
  if (props.currentSort !== defaultSortValue.value && defaultSortValue.value) {
    emit("update:sort", defaultSortValue.value);
  }
}

/**
 * Keyboard navigation handler for modal panel Escape key events.
 *
 * @remarks
 * THREAT: Trapping Escape key in active modal search inputs before dismissing panel.
 * First Escape clears active search query text; second Escape closes bottom sheet overlay.
 *
 * @param keyboardEvent - Native keyboard event payload.
 */
function handlePanelKeydown(keyboardEvent: KeyboardEvent): void {
  if (keyboardEvent.key !== "Escape") return;

  // Stepwise Escape handling: clear search query first before closing modal
  if (hasSearchQuery.value) {
    keyboardEvent.preventDefault();
    clearSearchField();
    return;
  }

  keyboardEvent.preventDefault();
  closeOptions();
}

/**
 * Restores keyboard focus to pre-dialog trigger or fallback button.
 */
function restoreFocus(): void {
  const target = previouslyFocused ?? triggerRef.value;
  previouslyFocused = null;
  target?.focus();
}

// Manage body scroll locks and focus management on panel open state transitions
watch(() => props.open, async (isOpen) => {
  if (isOpen) {
    // THREAT: Background body scrolling while modal sheet is open
    document.body.style.overflow = "hidden";
    await nextTick();
    panelRef.value?.focus();
    return;
  }

  // Restore document body scrollability
  document.body.style.overflow = "";
  await nextTick();
  restoreFocus();
});

onMounted(() => {
  if (props.open) document.body.style.overflow = "hidden";
});

onUnmounted(() => {
  document.body.style.overflow = "";
});
</script>

<template>
  <button
    ref="triggerRef"
    v-tactile
    type="button"
    class="view-options-trigger"
    :class="{ 'is-embedded': props.embedded, 'is-open': props.open, 'is-modified': isModified }"
    :aria-expanded="props.open"
    :aria-controls="panelId"
    aria-haspopup="dialog"
    :aria-label="`View options${accessibleState}`"
    @click="openOptions"
  >
    <Icon
      name="filter"
      size="18"
    />
    <span class="view-options-trigger-label">View</span>
    <span
      v-if="isModified"
      class="view-options-active-dot"
      aria-hidden="true"
    />
  </button>

  <Teleport to="body">
    <Transition name="view-options-sheet">
      <div
        v-if="props.open"
        class="view-options-sheet-backdrop"
        @click.self="closeOptions"
      >
        <section
          :id="panelId"
          ref="panelRef"
          class="view-options-panel view-options-sheet"
          :class="{ 'is-dragging': isDragging }"
          role="dialog"
          aria-modal="true"
          :aria-label="`${props.title} view options`"
          :style="dragOffset ? { transform: `translateY(${dragOffset}px)` } : undefined"
          tabindex="-1"
          @keydown="handlePanelKeydown"
        >
          <button
            v-tactile
            type="button"
            class="view-options-sheet-handle-target"
            aria-label="Close view options. Swipe down to dismiss."
            @click="handleSheetHandleClick"
            @touchstart.stop="beginSheetDrag"
            @touchmove.prevent.stop="trackSheetDrag"
            @touchend.stop="finishSheetDrag"
            @touchcancel.stop="finishSheetDrag"
          >
            <span class="view-options-sheet-handle" />
          </button>
          <div class="view-options-heading">
            <div>
              <p class="view-options-eyebrow">
                VIEW OPTIONS
              </p>
              <h2>{{ props.title }}</h2>
            </div>
          </div>

          <div
            v-if="props.showSearch"
            class="view-options-search"
          >
            <Icon
              name="search"
              size="18"
            />
            <input
              ref="searchInput"
              class="view-options-search-input"
              type="text"
              autocomplete="off"
              :placeholder="`Search ${props.title}`"
              aria-label="Search this view"
              :value="props.searchQuery ?? ''"
              @input="handleSearchInput"
              @keydown="handleSearchKeydown"
            >
            <button
              v-if="hasSearchQuery"
              v-tactile
              type="button"
              class="view-options-clear"
              aria-label="Clear search"
              @click="clearSearchField"
            >
              <Icon
                name="close"
                size="16"
              />
            </button>
          </div>

          <section
            v-if="props.sortOptions?.length"
            class="view-options-sort-section"
            aria-labelledby="view-options-order-label-mobile"
          >
            <div class="view-options-section-heading">
              <span id="view-options-order-label-mobile">Order</span>
              <span class="view-options-current-order">{{ activeSort?.label }}</span>
            </div>
            <div class="view-options-sort-list">
              <button
                v-for="sortOption in props.sortOptions"
                :key="sortOption.value"
                v-tactile
                type="button"
                class="view-options-sort-option"
                :class="{ 'is-selected': sortOption.value === props.currentSort }"
                :aria-pressed="sortOption.value === props.currentSort"
                @click="selectSort(sortOption.value)"
              >
                <span class="view-options-option-copy">
                  <span class="view-options-option-label">{{ sortOption.label }}</span>
                  <span
                    v-if="sortOption.desc"
                    class="view-options-option-description"
                  >{{ sortOption.desc }}</span>
                </span>
                <span
                  class="view-options-check"
                  aria-hidden="true"
                >
                  <Icon
                    name="check"
                    size="18"
                  />
                </span>
              </button>
            </div>
          </section>

          <div
            v-if="isModified"
            class="view-options-footer"
          >
            <button
              v-tactile
              type="button"
              class="view-options-reset"
              @click="resetOptions"
            >
              <Icon
                name="restore"
                size="16"
              />
              Reset view
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.view-options-trigger {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--sys-space-48);
  height: var(--sys-space-32);
  gap: var(--sys-space-6);
  padding: 0 var(--sys-space-8);
  color: var(--sys-color-on-surface-variant);
  background: transparent;
  border: 0;
  border-radius: var(--sys-shape-corner-small);
  cursor: pointer;
  transition:
    color var(--sys-motion-duration-200) var(--sys-motion-easing-standard),
    background-color var(--sys-motion-duration-200) var(--sys-motion-easing-standard),
    transform var(--sys-motion-duration-100) var(--sys-motion-easing-standard);
}

.view-options-trigger:hover,
.view-options-trigger.is-open {
  color: var(--sys-color-primary);
  background: var(--sys-color-surface-container-high);
}

.view-options-trigger:active { transform: scale(0.96); }

/* The summary rail is optically 32px tall; this transparent halo gives the
   compact trigger the same forgiving 44px pointer target as StatusPill. */
.view-options-trigger::after {
  content: "";
  position: absolute;
  inset: calc(-1 * var(--sys-space-6));
}

.view-options-trigger-label {
  font-size: var(--sys-typescale-label-md);
  font-weight: 800;
}

/* This variant visually completes the primary action cluster supplied by
   SelectionBar. It remains the same trigger and same sheet, not a second UI. */
.view-options-trigger.is-embedded {
  width: var(--sys-space-48);
  min-width: var(--sys-space-48);
  height: var(--sys-space-48);
  padding: 0;
  border-radius: 0 var(--sys-shape-corner-medium) var(--sys-shape-corner-medium) 0;
}

.view-options-trigger.is-embedded .view-options-trigger-label { display: none; }

.view-options-active-dot {
  width: var(--sys-space-6);
  height: var(--sys-space-6);
  border-radius: var(--sys-shape-corner-full);
  background: var(--sys-color-primary);
  box-shadow: 0 0 0 var(--sys-space-4) rgba(var(--sys-color-primary-rgb), 0.14);
}

.view-options-panel {
  position: fixed;
  box-sizing: border-box;
  width: min(360px, calc(100vw - var(--sys-space-24)));
  max-height: min(560px, calc(100vh - var(--sys-space-24)));
  overflow: auto;
  color: var(--sys-color-on-surface);
  background: var(--sys-surface-glass);
  backdrop-filter: var(--sys-surface-glass-blur);
  -webkit-backdrop-filter: var(--sys-surface-glass-blur);
  border: 1px solid var(--sys-surface-glass-border);
  border-radius: var(--sys-shape-corner-large);
  box-shadow: var(--sys-elevation-3);
}

.view-options-panel:focus-visible { outline: 2px solid var(--sys-color-primary); }

.view-options-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sys-space-12);
  padding: var(--sys-space-16) var(--sys-space-16) var(--sys-space-12);
}

.view-options-heading h2 {
  margin: var(--sys-space-2) 0 0;
  font-size: var(--sys-typescale-title-sm);
  line-height: var(--sys-leading-tight);
  font-weight: 800;
}

.view-options-eyebrow,
.view-options-section-heading {
  font-family: var(--sys-font-family-mono);
  font-size: var(--sys-typescale-label-sm);
  font-weight: 800;
  letter-spacing: var(--sys-tracking-wide);
  color: var(--sys-color-on-surface-variant);
}

.view-options-eyebrow { margin: 0; }

.view-options-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 var(--sys-space-32);
  width: var(--sys-space-32);
  height: var(--sys-space-32);
  color: var(--sys-color-on-surface-variant);
  background: transparent;
  border: 0;
  border-radius: var(--sys-shape-corner-full);
  cursor: pointer;
  transition:
    color var(--sys-motion-duration-200) var(--sys-motion-easing-standard),
    background-color var(--sys-motion-duration-200) var(--sys-motion-easing-standard),
    transform var(--sys-motion-duration-100) var(--sys-motion-easing-standard);
}

.view-options-clear:hover {
  color: var(--sys-color-on-surface);
  background: var(--sys-color-surface-container-highest);
}

.view-options-clear:active { transform: scale(0.9); }

.view-options-search {
  display: flex;
  align-items: center;
  min-height: var(--sys-space-48);
  margin: 0 var(--sys-space-16);
  padding: 0 var(--sys-space-12);
  gap: var(--sys-space-10);
  color: var(--sys-color-on-surface-variant);
  background: var(--sys-color-surface-container-high);
  border: 1px solid transparent;
  border-radius: var(--sys-shape-corner-input);
  transition:
    border-color var(--sys-motion-duration-200) var(--sys-motion-easing-standard),
    box-shadow var(--sys-motion-duration-200) var(--sys-motion-easing-standard),
    background-color var(--sys-motion-duration-200) var(--sys-motion-easing-standard);
}

.view-options-search:focus-within {
  background: var(--sys-color-surface-container-highest);
  border-color: rgba(var(--sys-color-primary-rgb), 0.48);
  box-shadow: 0 0 0 var(--sys-space-4) rgba(var(--sys-color-primary-rgb), 0.12);
}

.view-options-search-input {
  width: 100%;
  min-width: 0;
  height: var(--sys-space-48);
  padding: 0;
  color: var(--sys-color-on-surface);
  font: inherit;
  background: transparent;
  border: 0;
  outline: 0;
}

.view-options-clear { margin-right: calc(-1 * var(--sys-space-8)); }

.view-options-sort-section { padding: var(--sys-space-16); }

.view-options-section-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sys-space-12);
  margin-bottom: var(--sys-space-8);
}

.view-options-current-order {
  overflow: hidden;
  color: var(--sys-color-primary);
  font-weight: 700;
  letter-spacing: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.view-options-sort-list {
  display: grid;
  gap: var(--sys-space-4);
}

.view-options-sort-option {
  display: flex;
  align-items: center;
  min-height: var(--sys-space-48);
  padding: var(--sys-space-10) var(--sys-space-8) var(--sys-space-10) var(--sys-space-12);
  gap: var(--sys-space-12);
  color: var(--sys-color-on-surface);
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--sys-shape-corner-medium);
  cursor: pointer;
  transition:
    color var(--sys-motion-duration-200) var(--sys-motion-easing-standard),
    background-color var(--sys-motion-duration-200) var(--sys-motion-easing-standard),
    border-color var(--sys-motion-duration-200) var(--sys-motion-easing-standard),
    transform var(--sys-motion-duration-100) var(--sys-motion-easing-standard);
}

.view-options-sort-option:hover {
  background: var(--sys-color-surface-container-high);
  border-color: var(--sys-color-outline-variant);
}

.view-options-sort-option:active { transform: scale(0.99); }

.view-options-sort-option.is-selected {
  background: rgba(var(--sys-color-primary-rgb), 0.11);
  border-color: rgba(var(--sys-color-primary-rgb), 0.28);
}

.view-options-option-copy {
  display: grid;
  gap: var(--sys-space-2);
  min-width: 0;
  flex: 1;
}

.view-options-option-label {
  font-size: var(--sys-typescale-body-rg);
  font-weight: 800;
}

.view-options-option-description {
  color: var(--sys-color-on-surface-variant);
  font-size: var(--sys-typescale-body-sm);
  line-height: var(--sys-leading-normal);
}

.view-options-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 var(--sys-space-24);
  width: var(--sys-space-24);
  height: var(--sys-space-24);
  color: var(--sys-color-primary);
  opacity: 0;
  transform: scale(0.6);
  transition:
    opacity var(--sys-motion-duration-200) var(--sys-motion-easing-standard),
    transform var(--sys-motion-duration-200) var(--sys-motion-spring);
}

.view-options-sort-option.is-selected .view-options-check {
  opacity: 1;
  transform: scale(1);
}

.view-options-footer {
  display: flex;
  justify-content: flex-end;
  padding: var(--sys-space-8) var(--sys-space-16) var(--sys-space-16);
  border-top: 1px solid var(--sys-color-outline-variant);
}

.view-options-reset {
  display: inline-flex;
  align-items: center;
  min-height: var(--sys-space-48);
  padding: 0 var(--sys-space-12);
  gap: var(--sys-space-8);
  color: var(--sys-color-primary);
  font: inherit;
  font-weight: 800;
  background: transparent;
  border: 0;
  border-radius: var(--sys-shape-corner-small);
  cursor: pointer;
  transition:
    background-color var(--sys-motion-duration-200) var(--sys-motion-easing-standard),
    transform var(--sys-motion-duration-100) var(--sys-motion-easing-standard);
}

.view-options-reset:hover { background: rgba(var(--sys-color-primary-rgb), 0.1); }
.view-options-reset:active { transform: scale(0.97); }

.view-options-sheet-backdrop {
  position: fixed;
  z-index: var(--sys-z-overlay);
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: var(--sys-overlay-dark-strong);
}

.view-options-sheet {
  position: relative;
  width: 100%;
  max-width: var(--sys-layout-max-width);
  max-height: min(70vh, 560px);
  padding-bottom: calc(var(--sys-space-12) + var(--sys-safe-bottom));
  border-radius: var(--sys-shape-corner-large) var(--sys-shape-corner-large) 0 0;
  transition: transform var(--sys-motion-duration-300) var(--sys-motion-spring);
}

.view-options-sheet.is-dragging { transition: none; }

.view-options-sheet-handle-target {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: var(--sys-space-32);
  padding: 0;
  background: transparent;
  border: 0;
  cursor: grab;
  touch-action: none;
}

.view-options-sheet-handle-target:active { cursor: grabbing; }

.view-options-sheet-handle-target:focus-visible {
  outline: 2px solid var(--sys-color-primary);
  outline-offset: calc(-1 * var(--sys-space-4));
}

.view-options-sheet-handle {
  display: block;
  width: 36px;
  height: var(--sys-space-4);
  background: var(--sys-color-outline-variant);
  border-radius: var(--sys-shape-corner-full);
}

.view-options-sheet-enter-active,
.view-options-sheet-leave-active {
  transition: opacity var(--sys-motion-duration-250) var(--sys-motion-easing-standard);
}

.view-options-sheet-enter-from,
.view-options-sheet-leave-to { opacity: 0; }

.view-options-sheet-enter-active .view-options-sheet,
.view-options-sheet-leave-active .view-options-sheet {
  transition: transform var(--sys-motion-duration-300) var(--sys-motion-spring);
}

.view-options-sheet-enter-from .view-options-sheet,
.view-options-sheet-leave-to .view-options-sheet { transform: translateY(100%); }

@media (min-width: 521px) {
  /* A fixed desktop sheet height makes the scrollport unambiguous: wheel and
     trackpad input always continue through the remaining order options rather
     than falling through to the page behind the modal. */
  .view-options-sheet {
    height: min(70vh, 560px);
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--sys-color-outline-variant) transparent;
  }

  .view-options-sheet::-webkit-scrollbar { width: var(--sys-space-4); }
  .view-options-sheet::-webkit-scrollbar-thumb {
    background: var(--sys-color-outline-variant);
    border-radius: var(--sys-shape-corner-full);
  }
}

@media (max-width: 520px) {
  .view-options-trigger {
    width: var(--sys-space-48);
    padding: 0;
  }

  .view-options-trigger-label { display: none; }

  .view-options-active-dot {
    position: absolute;
    top: var(--sys-space-6);
    right: var(--sys-space-6);
  }
}
</style>
