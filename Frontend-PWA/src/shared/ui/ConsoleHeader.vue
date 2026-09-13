<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { computed, ref, unref } from "vue";
import { useHaptics } from "../composables/useHaptics";
import { useHeaderScroll } from "../composables/useHeaderScroll";
import StatusPill from "./StatusPill.vue";
import Icon from "./Icon.vue";
import BaseSelect from "./BaseSelect.vue";
import type { ConsoleRemoteInfo, HubHealth } from "@core/types";

/**
 * Whether the status pill currently has its detail open. Reported by the pill
 * itself, not read off its DOM, so the header can react to a state it does not
 * own without depending on the pill's internal class names.
 */
const isStatusDetailOpen = ref(false);

const props = defineProps<{
  title: string;
  status?: {
    type: HubHealth["type"];
    text: HubHealth["label"];
    nominal?: boolean;
  };
  showSearch?: boolean;
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
const { isScrolled } = useHeaderScroll(10);

let debounceTimer: number | null = null;

const handleInput = (inputEvent: Event) => {
  const searchQueryCandidate = (inputEvent.target as HTMLInputElement).value;
  if (debounceTimer) window.clearTimeout(debounceTimer);

  debounceTimer = window.setTimeout(() => {
    emit("update:search", searchQueryCandidate);
  }, 300);
};

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
    :class="{ 'is-scrolled': unref(isScrolled) }"
  >
    <div class="header-main">
      <div class="title-row">
        <div class="title-group">
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
        </div>

        <div
          class="action-group"
          :class="{ 'is-detail-open': isStatusDetailOpen }"
        >
          <StatusPill
            v-if="props.status && !props.loading"
            :type="props.status.type"
            :text="props.status.text"
            :nominal="props.status.nominal"
            :remote-info="props.remoteInfo"
            direction="left"
            @update:expanded="isStatusDetailOpen = $event"
            @refresh="emit('refresh')"
          />
        </div>
      </div>

      <div
        v-if="props.showSearch || !!$slots.filters"
        class="search-sort-row"
      >
        <div
          v-if="props.showSearch"
          class="search-bar"
        >
          <div class="search-box">
            <Icon
              name="search"
              size="18"
              class="search-icon"
            />
            <input
              type="text"
              class="search-input"
              placeholder="Search..."
              autocomplete="off"
              aria-label="Search"
              @input="handleInput"
            >
          </div>
        </div>

        <!-- Custom Filters / Controls Slot -->
        <slot name="filters" />

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
      </div>
    </div>

    <div
      v-if="!!$slots.extra"
      class="header-extra"
    >
      <slot name="extra" />
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
  padding: var(--sys-space-18) var(--sys-space-18) var(--sys-space-24) var(--sys-space-18);
  margin-bottom: var(--sys-space-24);
  transition: all var(--sys-motion-duration-400) var(--sys-motion-spring);
  box-shadow: var(--sys-elevation-2);
}

.console-header.is-scrolled {
  margin-top: var(--sys-space-8);
  padding: var(--sys-space-12) var(--sys-space-18) var(--sys-space-18) var(--sys-space-18);
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

/* [DECISION LOG] THE VIEW'S NAME IS NEVER WHAT GETS CUT:
   Every element in this row declared flex-shrink: 0 except the title, so the
   title absorbed one hundred percent of any overflow and did it silently.
   Measured at 375px: expanding the status pill grows .action-group from 82px
   to 233px, and all 151 of those pixels came out of the title, which reached
   clientWidth: 0 - the view's own name erased, with no ellipsis left to show
   it had happened. "Roster" needs 72px and survived; "Headhunter" needs about
   130px and read "Headhu...".

   Wrapping fixes it without a breakpoint or a hidden word. The row now grows a
   second line when the first cannot hold everything, so the name and the count
   keep their full width and the status pill moves below them, still right
   aligned. Nothing is hidden and nothing is truncated: a narrow viewport costs
   one line of height instead of the title. Roster still fits on one line and is
   unchanged, and an expanded pill takes its own line, which is the right answer
   for a deliberate reveal. */
.title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--sys-space-12);
  flex-wrap: wrap;
}

.title-group {
  display: flex;
  align-items: center;
  gap: var(--sys-space-12);
  flex: 1;
  /* Refusing to shrink below the name plus the count is what actually makes the
     row wrap. Without it the row has nothing to wrap - the shortfall is inside
     this group, not between it and the status pill - so the group stayed one
     line and its contents spilled over the pill instead. Measured at 375px:
     "Headhunter" plus "48 Members" needs 218px against the 168px this group was
     being handed, and the count chip overlapped the pill by 38px. */
  min-width: max-content;
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
  flex: 1;
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
  /* The name takes the width it needs and the row wraps around it. The ellipsis
     above stays as a last resort for a title longer than a whole line, which no
     current view has; max-width keeps that case inside the header rather than
     widening the page. */
  flex-shrink: 0;
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
  gap: var(--sys-space-8);
  flex-shrink: 0;
  /* Holds it against the right edge on the line it lands on, whether that is
     beside the title or wrapped beneath it. */
  margin-left: auto;
}

/* [DECISION LOG] A WRAPPED DETAIL FILLS ITS LINE INSTEAD OF FLOATING IN IT:
   Opening the status detail on a phone makes it too wide to sit beside the
   title, so it takes the line below. Whether that reads as designed or as a
   bug turned out to depend entirely on how much the pill had to say. A stale
   clan expands to "SYNCED 16M AGO; SOURCE DATA 34M AGO - STALE", which happens
   to span the line and looks deliberate. A healthy one expands to "27M AGO -
   DB" and left a short chip adrift at the right of an otherwise empty line,
   which is what was reported.

   Filling the line removes the difference: the detail is the same width either
   way, and it lines up with the search field directly beneath it rather than
   hanging above it. space-between then pins the reading order to both edges -
   the text to the left, the state dot to the right - so a short message spaces
   out rather than clumping in one corner.

   Scoped to the phone width on purpose. On a wide viewport the detail still
   fits beside the title and never wraps, so stretching it there would trade a
   real layout for a very long stadium and a header that changes height on tap.

   :has() is the honest way to say "when the thing inside is open". Where it is
   unsupported the rule is skipped and the result is today's behaviour, so the
   floor is what shipped rather than something broken. */
@media (max-width: 600px) {
  .action-group.is-detail-open {
    width: 100%;
  }

  /* StatusPill declares flex-shrink: 0, which is right while it is a chip
     sitting beside other things and wrong once it owns the line: its expanded
     content measured 321px against a 313px line and the extra 8px ate into the
     card's right padding, so the bar looked mis-set rather than full width.
     On its own line it shrinks to the line instead. */
  .action-group.is-detail-open :deep(.status-pill) {
    flex: 1 1 auto;
    min-width: 0;
    justify-content: space-between;
  }
}

.search-sort-row {
  display: flex;
  align-items: center;
  gap: var(--sys-space-12);
}

.search-bar {
  flex: 1;
  min-width: 0;
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
  border: 1px solid rgba(128, 128, 128, 0.15);
  box-shadow: inset 0 2px 4px var(--sys-overlay-dark-subtle);
  transition: all var(--sys-motion-duration-200) ease;
}

.search-box:focus-within {
  border-color: rgba(var(--sys-color-primary-rgb), 0.3);
}

.search-icon {
  color: var(--sys-color-on-surface-variant);
}

.search-input {
  flex: 1;
  align-self: stretch;
  background: none;
  border: none;
  color: var(--sys-color-on-surface);
  font-size: var(--sys-typescale-body-rg);
  outline: none;
}

.sort-box {
  flex-shrink: 0;
  width: auto;
  min-width: 110px;
}

.sort-desc {
  display: none;
}
</style>
