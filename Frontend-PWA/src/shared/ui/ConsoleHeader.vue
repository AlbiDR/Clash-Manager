<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { Comment, computed, Fragment, Text, unref, useSlots, useTemplateRef, type VNode } from "vue";
import { useHaptics } from "../composables/useHaptics";
import { useSearchField } from "../composables/useSearchField";
import { useHeaderScroll } from "../composables/useHeaderScroll";
import StatusPill from "./StatusPill.vue";
import Icon from "./Icon.vue";
import BaseSelect from "./BaseSelect.vue";
import type { ConsoleRemoteInfo, HubHealth } from "@core/types";

const props = defineProps<{
  title: string;
  status?: {
    type: HubHealth["type"];
    text: HubHealth["label"];
    nominal?: boolean;
  };
  showSearch?: boolean;
  /**
   * The live query, owned by whoever filters the list. Supplying it makes the
   * input controlled, which is what lets the owner clear it - previously the
   * field only ever emitted upward and reflected nothing back, so clearing the
   * state left the stale text sitting in the box.
   */
  searchQuery?: string;
  /**
   * Holds the header open regardless of scrolling. Set by the host while
   * something it owns is mid-task, such as an active selection.
   */
  pinExpanded?: boolean;
  dashboardUrl?: string;
  stats?: { label: string; value: string };
  sortOptions?: { label: string; value: string; desc?: string; fullDesc?: string }[];
  currentSort?: string;
  loading?: boolean;
  remoteInfo?: ConsoleRemoteInfo;
}>();

const emit = defineEmits<{
  "update:search": [string];
  "update:sort": [string];
  refresh: [];
}>();

const haptics = useHaptics();
const slots = useSlots();

/**
 * ConsoleLayout forwards its filters slot even when a view supplies no filter.
 * A slot function therefore exists in Settings and Headhunter despite producing
 * only Vue placeholder comments nested inside a Fragment. Treating its
 * existence as content was the source of an empty header row and spacer.
 */
function hasRenderableSlotContent(slotNodes: VNode[]): boolean {
  return slotNodes.some((slotNode) => {
    if (slotNode.type === Comment) return false;
    if (slotNode.type === Text) return typeof slotNode.children === "string" && slotNode.children.trim().length > 0;
    if (slotNode.type === Fragment && Array.isArray(slotNode.children)) {
      return hasRenderableSlotContent(slotNode.children as VNode[]);
    }
    return true;
  });
}

const hasFilters = computed(() => hasRenderableSlotContent(slots.filters?.() ?? []));

const hasControls = computed(() =>
  props.showSearch === true || hasFilters.value || (props.sortOptions?.length ?? 0) > 0,
);

const hasExtra = computed(() => hasRenderableSlotContent(slots.extra?.() ?? []));
/**
 * The header condenses while the reader travels away from the top, and refuses
 * to while any control it hosts is in use - an open search field, or a live
 * selection its host reports through `pinExpanded`. Taking a working control
 * away mid-task is the one thing this must never do.
 */
const { isScrolled, isCondensed } = useHeaderScroll({
  threshold: 10,
  isPinned: () => isSearchOpen.value || props.pinExpanded === true,
});

/** The field itself, owned here because the element belongs to this template. */
const searchInput = useTemplateRef<HTMLInputElement>("searchInput");

const {
  isOpen: isSearchOpen,
  hasQuery: hasSearchQuery,
  openSearchField,
  closeSearchField,
  clearSearchField,
  handleSearchInput,
  handleSearchKeydown,
} = useSearchField({
  readQuery: () => props.searchQuery ?? "",
  onQueryChange: (query) => emit("update:search", query),
  focusInput: () => searchInput.value?.focus(),
  blurInput: () => searchInput.value?.blur(),
});

const activeSortDescription = computed(() => {
  if (!props.sortOptions || !props.currentSort) return "";
  const activeSortOption = props.sortOptions.find((optionCandidate) => optionCandidate.value === props.currentSort);
  return activeSortOption?.desc || "";
});

const handleOpenDashboard = () => {
  if (props.dashboardUrl) {
    haptics.tap();
    window.open(props.dashboardUrl, "_blank");
  }
};
</script>

<template>
  <header
    class="console-header"
    :class="{ 'is-scrolled': unref(isScrolled), 'is-condensed': unref(isCondensed) }"
  >
    <div class="header-main">
      <div class="header-summary">
        <div class="title-main">
          <h1
            class="view-title"
            :class="{ 'is-link': props.dashboardUrl }"
            :title="props.dashboardUrl ? 'Open Supabase Dashboard' : undefined"
            @click="handleOpenDashboard"
          >
            {{ props.title }}
          </h1>
          <div
            v-if="props.stats"
            class="title-label"
          >
            <span class="count-value">{{ props.stats.value }}</span>
            <span class="count-label label-caption">{{ props.stats.label }}</span>
          </div>
        </div>

        <div class="action-group">
          <StatusPill
            v-if="props.status && !props.loading"
            :type="props.status.type"
            :text="props.status.text"
            :nominal="props.status.nominal"
            :remote-info="props.remoteInfo"
          />
        </div>
      </div>

      <div
        v-if="hasControls || hasExtra"
        class="header-controls"
      >
        <!-- [DECISION LOG] PROMINENCE TRACKS WHETHER THE CONTROL IS WORKING:
             Idle this is a 48px icon; the moment it holds a query it is a
             field, and it cannot be dismissed back to an icon while that query
             stands. That rule is what makes collapsing safe here, because the
             query outlives a view switch, so a collapsed control with a live
             filter is reachable in ordinary use rather than hypothetical.

             It also settles both size extremes the old always-open field got
             wrong. At 320px it had been crushed to 108px and was clipping its
             own contents; at 1440px it ballooned to 508px, 77% of the row, for
             a list of forty-odd rows. An icon has one size and an open field
             has a ceiling. -->
        <div
          v-if="props.showSearch"
          class="search-bar"
          :class="{ 'is-open': isSearchOpen }"
        >
          <button
            v-if="!isSearchOpen"
            type="button"
            class="search-trigger"
            aria-label="Search"
            :aria-expanded="false"
            @click="openSearchField"
          >
            <Icon
              name="search"
              size="18"
            />
          </button>

          <div
            v-else
            class="search-box"
          >
            <Icon
              name="search"
              size="18"
              class="search-icon"
            />
            <input
              ref="searchInput"
              type="text"
              class="search-input"
              placeholder="Search..."
              autocomplete="off"
              aria-label="Search"
              :value="props.searchQuery ?? ''"
              @input="handleSearchInput"
              @keydown="handleSearchKeydown"
              @blur="closeSearchField"
            >
            <button
              v-if="hasSearchQuery"
              type="button"
              class="search-clear"
              aria-label="Clear search"
              @mousedown.prevent
              @click="clearSearchField"
            >
              <Icon
                name="close"
                size="16"
              />
            </button>
          </div>
        </div>

        <div
          v-if="hasFilters"
          class="filter-slot"
        >
          <slot name="filters" />
        </div>

        <div
          v-if="props.sortOptions"
          class="sort-box"
        >
          <BaseSelect
            :model-value="props.currentSort || ''"
            :options="props.sortOptions"
            aria-label="Sort by"
            @update:model-value="(targetSortValue) => emit('update:sort', targetSortValue)"
          />
          <span
            v-if="activeSortDescription"
            class="sort-desc"
          >
            {{ activeSortDescription }}
          </span>
        </div>

        <div
          v-if="hasExtra"
          class="header-extra"
        >
          <slot name="extra" />
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.console-header {
  position: sticky;
  top: 0;
  z-index: var(--sys-z-header);
  background: var(--sys-surface-glass);
  backdrop-filter: var(--sys-surface-glass-blur);
  -webkit-backdrop-filter: var(--sys-surface-glass-blur);
  border: 1px solid var(--sys-surface-glass-border);
  border-radius: var(--sys-shape-corner-extra-large);
  padding: var(--sys-space-16) var(--sys-space-18) var(--sys-space-18);
  margin-bottom: var(--sys-space-24);
  transition: all var(--sys-motion-duration-400) var(--sys-motion-spring);
  box-shadow: var(--sys-elevation-2);
}

.console-header.is-scrolled {
  margin-top: var(--sys-space-8);
  padding: var(--sys-space-10) var(--sys-space-14);
  border-radius: var(--sys-shape-corner-m);
}

.header-main {
  display: flex;
  flex-direction: column;
  gap: var(--sys-space-12);
}

.header-extra {
  margin-top: var(--sys-space-12);
}

/* [DECISION LOG] THE SECONDARY ROWS STAND DOWN WHILE THE READER IS READING:
   The header is sticky, so on a 812px viewport it held 245px - thirty per cent
   of the screen - in front of the list for the entire scroll. Travelling away
   from the top is a good signal that the reader wants the list rather than the
   controls, so the search, sort and selection rows collapse and the title row
   stays, which keeps the answer to "where am I" on screen at all times.

   The negative margin cancels the flex gap the collapsed row would otherwise
   still reserve: a zero-height flex item is still an item, and its gap survives
   it, leaving twelve pixels of nothing behind.

   [DECISION LOG] overflow is hidden only WHILE condensed, never at rest. The
   sort control's dropdown is absolutely positioned inside this row, so clipping
   it permanently would cut the menu off at the header's edge. While condensed
   the row is inert and the dropdown cannot be open, so clipping is free there.
   The cost is that expansion is briefly unclipped, which the opacity fade
   covers.

   Reduced motion needs nothing here: the global rule keeps opacity and height
   in the transition list and drops transform, so this becomes a fade rather
   than being deleted. */
.header-controls {
  max-height: var(--sys-layout-header-row-max-height);
  transition:
    max-height var(--sys-motion-duration-250) var(--sys-motion-easing-standard),
    opacity var(--sys-motion-duration-200) var(--sys-motion-easing-standard),
    margin-top var(--sys-motion-duration-250) var(--sys-motion-easing-standard);
}

.console-header.is-condensed .header-controls {
  max-height: 0;
  opacity: 0;
  margin-top: calc(-1 * var(--sys-space-12));
  overflow: hidden;
  pointer-events: none;
}

/* The summary has exactly two jobs: establish the view and expose system
   health. Details belong to the status popover, never to the document flow. */
.header-summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--sys-space-12);
}

.title-main {
  display: flex;
  align-items: baseline;
  gap: var(--sys-space-8);
  /* Last resort for a viewport too narrow to hold the name and the count on one
     line at all, narrower than any phone this ships to. The count drops below
     the name rather than either being cut. */
  flex-wrap: wrap;
  min-width: 0;
}

.view-title {
  margin: 0;
  font-size: var(--sys-typescale-title-lg);
  line-height: var(--sys-leading-none);
  font-weight: 900;
  color: var(--sys-color-on-surface);
  letter-spacing: var(--sys-tracking-tight);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: all var(--sys-motion-duration-200) var(--sys-motion-spring);
  min-width: 0;
  flex: 0 1 auto;
  max-width: 100%;
}

.view-title.is-link {
  cursor: pointer;
}

.view-title.is-link:hover {
  color: var(--sys-color-primary);
}

.view-title.is-link:active {
  transform: scale(0.96);
  opacity: 0.8;
}

.title-label {
  display: flex;
  align-items: baseline;
  gap: var(--sys-space-4);
  padding: var(--sys-space-2) var(--sys-space-8);
  background: var(--sys-color-surface-container);
  border-radius: var(--sys-shape-corner-small);
  font-family: var(--sys-font-family-mono);
  flex-shrink: 0;
}

.count-value {
  font-size: var(--sys-typescale-body-md);
  font-weight: 800;
  color: var(--sys-color-primary);
}

.count-label {
  color: var(--sys-color-on-surface-variant);
}

.action-group {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

/* Controls form a distinct, predictable region. They never borrow height from
   the summary and only a real filter can introduce a third, labelled control
   line on a narrow device. */
.header-controls {
  display: flex;
  align-items: center;
  gap: var(--sys-space-12);
  min-width: 0;
}

.filter-slot {
  flex: 1 1 auto;
  min-width: 0;
}

/* The score threshold and its Select action are one operation, so they stay
   compact and immediately adjacent after the search and sort controls. A
   toolbar must not invent a broad container just to push a related button to
   the opposite edge. */
.header-extra {
  display: flex;
  flex: 0 0 auto;
  min-width: 0;
}

.header-extra :deep(.selection-bar) {
  height: var(--sys-space-48);
}

/* [DECISION LOG] THE CONTROL TAKES THE SPACE IT IS USING, NOT THE SPACE THERE IS:
   Idle it is a fixed 48px icon that yields every spare pixel to its row-mates.
   Open it grows, but only to a ceiling, because the queries it takes are player
   names of a few characters. The old rule was a flat `flex: 1`, which made the
   field a hostage to the viewport in both directions: crushed to 108px and
   clipping its own contents at 320px, ballooned to 508px at 1440px. */
.search-bar {
  flex: 0 0 auto;
  min-width: 0;
}

.search-bar.is-open {
  flex: 1 1 var(--sys-layout-search-min-width);
  min-width: var(--sys-layout-search-min-width);
  max-width: var(--sys-layout-search-max-width);
}

/* Square, so the icon sits in the middle of a target that already meets the
   ADR's 48px minimum without a pseudo-element widening it. */
.search-trigger {
  width: var(--sys-space-48);
  height: var(--sys-space-48);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--sys-color-surface-container-high);
  border: 1px solid var(--sys-color-outline-variant);
  border-radius: var(--sys-shape-corner-input);
  color: var(--sys-color-on-surface-variant);
  cursor: pointer;
  transition:
    color var(--sys-motion-duration-200) var(--sys-motion-easing-standard),
    background-color var(--sys-motion-duration-200) var(--sys-motion-easing-standard);
}

.search-trigger:hover {
  color: var(--sys-color-on-surface);
  background: var(--sys-color-surface-container-highest);
}

.search-trigger:active {
  transform: scale(0.96);
}

/* Only appears while there is something to clear, so it never occupies the
   field as dead weight. mousedown is prevented on it in the template: without
   that the input blurs first, and a blur that closed the field would take the
   button out from under the finger before the click landed. */
.search-clear {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--sys-space-4);
  border-radius: var(--sys-shape-corner-full);
  background: none;
  border: none;
  color: var(--sys-color-on-surface-variant);
  cursor: pointer;
  transition: color var(--sys-motion-duration-200) var(--sys-motion-easing-standard);
}

.search-clear::after {
  content: "";
  position: absolute;
  inset: calc(-1 * var(--sys-space-12));
}

.search-clear:hover {
  color: var(--sys-color-on-surface);
}

/* [DECISION LOG] 48, MATCHING ITS ROW-MATE:
   This stood at 40px beside a 48px sort control in the same flex row, so two
   fields that read as a pair were visibly different heights, and it sat under
   the ADR touch minimum. The input inside it only occupied 23px of that, so
   the actual target was smaller again; stretching it to the box's full height
   makes the whole field tappable rather than just the text line. */
.search-box {
  position: relative;
  height: var(--sys-space-48);
  background: var(--sys-color-surface-container-high);
  border-radius: var(--sys-shape-corner-input);
  display: flex;
  align-items: center;
  padding: 0 var(--sys-space-14);
  gap: var(--sys-space-12);
  /* Was rgba(128, 128, 128, 0.15): a grey mixed by hand, frozen across both
     themes and invisible to the overlay firewall, which polices pure black and
     white only. outline-variant is this line's actual role. */
  border: 1px solid var(--sys-color-outline-variant);
  box-shadow: inset 0 2px 4px var(--sys-overlay-dark-subtle);
  transition: all var(--sys-motion-duration-200) ease;
}

.search-box:focus-within {
  border-color: rgba(var(--sys-color-primary-rgb), 0.3);
}

.search-icon {
  color: var(--sys-color-on-surface-variant);
}

/* [DECISION LOG] min-width: 0 IS WHY THE FIELD USED TO CLIP:
   An <input> carries an intrinsic minimum width from its default size="20", so
   as a flex item under the initial `min-width: auto` it simply refuses to
   shrink below roughly 170px. Measured: a 161px box holding a 170px input, a
   53px shortfall, with the overflow hidden behind the box's own rounding. That
   is what crushed the old always-open field at 320px, and no amount of space
   granted to the parent fixes it - the child was never willing to fit. */
.search-input {
  flex: 1;
  min-width: 0;
  align-self: stretch;
  background: none;
  border: none;
  color: var(--sys-color-on-surface);
  font-size: var(--sys-typescale-body-rg);
  outline: none;
}

.sort-box {
  flex-shrink: 0;
  width: 152px;
}

.sort-desc {
  display: none;
}

@media (max-width: 520px) {
  .header-controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .search-bar,
  .search-bar.is-open {
    min-width: 0;
    max-width: none;
  }

  .filter-slot {
    grid-column: 1 / -1;
    order: 3;
  }

  .header-extra {
    grid-column: 1 / -1;
    min-width: 0;
  }
}
</style>
