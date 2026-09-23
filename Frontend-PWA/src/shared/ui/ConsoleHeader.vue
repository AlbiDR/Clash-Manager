<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import {
  Comment,
  computed,
  Fragment,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  Text,
  unref,
  useSlots,
  useTemplateRef,
  watch,
  type VNode,
} from "vue";
import { useHaptics } from "../composables/useHaptics";
import { useHeaderScroll } from "../composables/useHeaderScroll";
import StatusPill from "./StatusPill.vue";
import type { ConsoleRemoteInfo, HubHealth } from "@core/types";

const props = defineProps<{
  title: string;
  status?: {
    type: HubHealth["type"];
    text: HubHealth["label"];
    nominal?: boolean;
  };
  /**
   * Holds the header open regardless of scrolling. Set by the host while
   * something it owns is mid-task, such as an active selection.
   */
  pinExpanded?: boolean;
  dashboardUrl?: string;
  stats?: { label: string; value: string; compactValue?: string };
  loading?: boolean;
  remoteInfo?: ConsoleRemoteInfo;
}>();

const emit = defineEmits<{
  refresh: [];
}>();

const haptics = useHaptics();
const slots = useSlots();
const headerSummary = useTemplateRef<HTMLElement>("headerSummary");
const viewTitle = useTemplateRef<HTMLElement>("viewTitle");

/**
 * The title rail has five information states. It advances only when the title
 * would otherwise be visibly ellipsized, then re-measures before considering
 * the next concession. This makes compression depend on actual content width
 * (including long status/error labels), rather than an arbitrary viewport.
 */
const pressureStage = ref(0);
const FINAL_PRESSURE_STAGE = 4;
let resizeObserver: ResizeObserver | undefined;
let pressureRun = 0;
let pressureScheduled = false;

function titleWouldTruncate() {
  const titleElement = viewTitle.value;
  const summaryElement = headerSummary.value;
  // JSDOM has no layout; leave component tests at the complete default state.
  if (!titleElement || !summaryElement || summaryElement.getBoundingClientRect().width === 0) return false;
  return titleElement.scrollWidth > titleElement.clientWidth + 1;
}

async function resolveHeaderPressure() {
  const run = ++pressureRun;
  pressureStage.value = 0;
  await nextTick();

  while (run === pressureRun && pressureStage.value < FINAL_PRESSURE_STAGE && titleWouldTruncate()) {
    pressureStage.value++;
    await nextTick();
  }
}

function scheduleHeaderPressureResolution() {
  if (pressureScheduled) return;
  pressureScheduled = true;
  queueMicrotask(() => {
    pressureScheduled = false;
    void resolveHeaderPressure();
  });
}

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

const hasControls = computed(() => hasFilters.value);

const hasExtra = computed(() => hasRenderableSlotContent(slots.extra?.() ?? []));
/**
 * The header condenses while the reader travels away from the top, and refuses
 * to while any control it hosts is in use - a live selection or view-options
 * panel its host reports through `pinExpanded`. Taking a working control
 * away mid-task is the one thing this must never do.
 */
const { isScrolled, isCondensed } = useHeaderScroll({
  threshold: 10,
  isPinned: () => props.pinExpanded === true,
});

const handleOpenDashboard = () => {
  if (props.dashboardUrl) {
    haptics.tap();
    window.open(props.dashboardUrl, "_blank");
  }
};

watch(
  () => [props.title, props.stats?.value, props.stats?.label, props.status?.text, props.loading],
  scheduleHeaderPressureResolution,
  { flush: "post" },
);

onMounted(() => {
  if (headerSummary.value && typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(scheduleHeaderPressureResolution);
    resizeObserver.observe(headerSummary.value);
  }
  // A late web-font resolution can change the title's intrinsic width without
  // changing the summary container's size, so it needs one final measurement.
  void document.fonts?.ready.then(scheduleHeaderPressureResolution);
  scheduleHeaderPressureResolution();
});

onUnmounted(() => {
  pressureRun++;
  resizeObserver?.disconnect();
});
</script>

<template>
  <header
    class="console-header"
    :class="[
      {
        'is-scrolled': unref(isScrolled),
        'is-condensed': unref(isCondensed),
      },
      `is-pressure-stage-${pressureStage}`,
    ]"
  >
    <div class="header-main">
      <div
        ref="headerSummary"
        class="header-summary"
      >
        <div class="title-main">
          <h1
            ref="viewTitle"
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
            :class="{ 'has-compact-value': props.stats.compactValue }"
            :aria-label="`${props.stats.value} ${props.stats.label}`"
          >
            <span
              class="count-value"
              aria-hidden="true"
            >
              <span class="count-value-full">{{ props.stats.value }}</span>
              <span
                v-if="props.stats.compactValue"
                class="count-value-compact"
              >{{ props.stats.compactValue }}</span>
            </span>
            <span
              class="count-label label-caption"
              aria-hidden="true"
            >{{ props.stats.label }}</span>
          </div>
        </div>

        <div class="action-group">
          <StatusPill
            v-if="props.status && !props.loading"
            :type="props.status.type"
            :text="props.status.text"
            :nominal="props.status.nominal"
            :remote-info="props.remoteInfo"
            :compression-stage="pressureStage"
            @refresh="emit('refresh')"
          />
        </div>
      </div>

      <div
        v-if="hasControls || hasExtra"
        class="header-controls"
      >
        <div
          v-if="hasFilters"
          class="refinement-controls"
        >
          <div class="filter-slot">
            <slot name="filters" />
          </div>
        </div>

        <div
          v-if="hasExtra"
          class="selection-actions"
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

/* [DECISION LOG] THE SECONDARY ROWS STAND DOWN WHILE THE READER IS READING:
   The header is sticky, so on a 812px viewport it held 245px - thirty per cent
   of the screen - in front of the list for the entire scroll. Travelling away
   from the top is a good signal that the reader wants the list rather than the
   controls, so view-specific filters and selection rows collapse while the
   title rail stays. Search and order are an on-demand sheet, so they do not
   consume sticky-header space at all.

   The negative margin cancels the flex gap the collapsed row would otherwise
   still reserve: a zero-height flex item is still an item, and its gap survives
   it, leaving twelve pixels of nothing behind.

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
  align-items: center;
  min-height: var(--sys-space-32);
  gap: var(--sys-space-12);
}

.title-main {
  display: flex;
  align-items: center;
  /* The title and connection state occupy one 32px visual rail. Keeping the
     rail explicit prevents a larger interactive hit area on the pill from
     pulling the status visibly above the view title. */
  height: var(--sys-space-32);
  min-height: var(--sys-space-32);
  gap: var(--sys-space-8);
  /* The title rail has one line only. Its information hierarchy is condensed
     in ordered stages below; it must never create an accidental second row. */
  flex-wrap: nowrap;
  min-width: 0;
}

.view-title {
  margin: 0;
  font-size: var(--sys-typescale-title-lg);
  /* `overflow: hidden` is required for ellipsis, so its line box is also the
     glyph clipping boundary. Keep vertical leading here instead of relying on
     font metrics fitting exactly inside the em square: a future font, weight,
     or title string must retain room for its lowest rendered pixels. The
     1.1 shared tight leading still rounded to a 26px box for this 24px title
     while its glyph metrics needed 27px; 1.2 clears that rounding boundary
     while remaining inside the 32px title rail. */
  line-height: 1.2;
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

.count-value-compact { display: none; }

.count-label {
  color: var(--sys-color-on-surface-variant);
}

.action-group {
  display: flex;
  align-items: center;
  height: var(--sys-space-32);
  gap: var(--sys-space-6);
  flex-shrink: 0;
}

/*
 * Header pressure ladder
 * ----------------------
 * `pressureStage` is resolved from actual title overflow, resetting to the
 * complete state before every measurement. Each stage is therefore earned by
 * a real collision, regardless of whether it comes from a small viewport, a
 * resized desktop window, a longer title, or an error-shaped status label.
 */
.console-header.is-pressure-stage-2 .title-label,
.console-header.is-pressure-stage-3 .title-label,
.console-header.is-pressure-stage-4 .title-label { gap: 0; }

.console-header.is-pressure-stage-2 .count-label,
.console-header.is-pressure-stage-3 .count-label,
.console-header.is-pressure-stage-4 .count-label { display: none; }

.console-header.is-pressure-stage-3 .action-group,
.console-header.is-pressure-stage-4 .action-group { display: none; }
.console-header.is-pressure-stage-4 .title-label { display: none; }

/* A console toolbar only appears for view-specific filters or selection. Search
   and order live behind the title-rail View button, so this grid never reserves
   a second row for controls that the reader is not actively using. */
.header-controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  column-gap: var(--sys-space-12);
  min-width: 0;
}

.refinement-controls {
  display: flex;
  align-items: center;
  gap: var(--sys-space-12);
  grid-column: 1;
  justify-self: start;
  height: var(--sys-space-48);
  min-width: 0;
}

.filter-slot {
  flex: 1 1 auto;
  min-width: 0;
}

/* Score threshold and Select remain a compact pair. This group, rather than
   its primary button alone, anchors the right-hand edge. */
.selection-actions {
  display: flex;
  grid-column: 3;
  align-items: center;
  justify-self: end;
  height: var(--sys-space-48);
  flex: 0 0 auto;
  min-width: 0;
}

.selection-actions :deep(.selection-bar) {
  height: var(--sys-space-48);
}

@media (min-width: 521px) {
  /* Desktop has room for the score drag surface to become genuinely useful.
     The action cluster grows only to a calm ceiling; every further pixel goes
     to the slider, where it improves precision rather than creating dead air. */
  .selection-actions {
    grid-column: 1 / -1;
    justify-self: stretch;
    width: 100%;
  }

  .selection-actions :deep(.selection-bar) {
    display: grid;
    /* Select/Done is a concise commitment, not a second primary surface.
       Leave it enough room for its stable active label plus the trailing View
       trigger, then return every further pixel to the score drag surface. */
    grid-template-columns: minmax(0, 1fr) minmax(160px, 208px);
    width: 100%;
    gap: var(--sys-space-12);
  }

  .selection-actions :deep(.sel-group.strategy),
  .selection-actions :deep(.score-pill-group),
  .selection-actions :deep(.sel-group.management) {
    width: 100%;
    min-width: 0;
  }

  .selection-actions :deep(.morph-btn) {
    flex: 1;
    width: auto;
    min-width: 0;
  }
}

@media (max-width: 520px) {
  /* Filtered totals are useful, but a title rail must never break merely to
     spell "of". The label still provides the unit: `2/38 MEMBERS`. */
  .count-value-compact { display: inline; }
  .title-label.has-compact-value .count-value-full { display: none; }

  .header-controls {
    display: flex;
    align-items: stretch;
    flex-direction: column;
    gap: var(--sys-space-12);
  }

  .refinement-controls {
    display: flex;
    align-items: stretch;
    flex-direction: column;
    height: auto;
  }

  .selection-actions {
    align-self: stretch;
    width: 100%;
    height: var(--sys-space-48);
  }

  /* On a phone the secondary row is a two-action decision: choose a score
     band, then apply it. Both controls share the full available width rather
     than leaving the primary action marooned on the left. */
  .selection-actions :deep(.selection-bar) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    width: 100%;
    gap: var(--sys-space-12);
  }

  .selection-actions :deep(.sel-group) { min-width: 0; }

  .selection-actions :deep(.sel-group.strategy) { width: 100%; }

  .selection-actions :deep(.score-pill-group) {
    width: 100%;
    min-width: 0;
  }

  .selection-actions :deep(.sel-group.management) { width: 100%; }

  .selection-actions :deep(.morph-btn) {
    flex: 1;
    width: auto;
    min-width: 0;
  }
}

@media (min-width: 481px) and (max-width: 520px) {
  /* Once a phone has room beyond the safe narrow layout, the joined action
     cluster stops growing at a practical ceiling. The slider receives the
     surplus because horizontal travel is its actual interaction budget. */
  .selection-actions :deep(.selection-bar) {
    grid-template-columns: minmax(0, 1fr) minmax(176px, 184px);
  }
}
</style>
