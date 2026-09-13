<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->

<script setup lang="ts">
import { computed, useTemplateRef } from "vue";
import {
  usePrecisionSlider,
  type SliderScale,
  type SliderTickMark,
} from "../composables/usePrecisionSlider";

/**
 * SHARED UI: PrecisionSlider (Layer 2)
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 2 (@shared/ui)
 * - **Role:** Interactive molecule. The full-width surface for choosing one
 *   value from a continuous domain, used wherever a settings row has the width
 *   to carry a label, a readout and a scale.
 * - **Satisfaction:** ADR Section II (Unitary Architecture), Section VII
 *   (Naming Contract), Target B.2 (48px touch footprint).
 *
 * [DECISION LOG] LOGIC DELEGATION:
 * Interaction lives in `usePrecisionSlider`, which is also what the console
 * header's compact pill consumes. Sharing the composable rather than adding a
 * variant prop here keeps this component to one reason to change (how a
 * full-width slider looks) and stops a 48px pill from dragging its own layout
 * concerns into this template.
 *
 * [DECISION LOG] THUMB SIZE IS DECLARED IN SCRIPT, NOT CSS:
 * The travel inset needs the handle diameter in both the pointer mapping and
 * the rendered geometry. Declaring it here and publishing it to CSS as
 * `--ps-thumb` keeps one authority for the number; reading it back out of
 * `getComputedStyle` on every pointer move would be both slower and a second
 * source of truth.
 */

/** Visual scale of the control. Governs handle, track and touch dimensions. */
export type SliderDensity = "comfortable" | "compact";

/**
 * Rendered handle diameter per density, in pixels.
 *
 * @remarks
 * 18px is large enough to read as a grabbable object while small enough that its
 * centre still reads as an exact point on the scale. The compact tier trims it
 * for rows that sit inside an already-dense container.
 */
const THUMB_SIZE_PX: Record<SliderDensity, number> = {
  comfortable: 18,
  compact: 14,
};

const props = withDefaults(
  defineProps<{
    /** Accessible name, also rendered as the visible row label. */
    label: string;
    /** Lowest selectable value. Must be greater than zero when `scale` is `log`. */
    min: number;
    /** Highest selectable value. */
    max: number;
    /** Granularity applied to values that do not land on a detent. */
    step: number;
    /** Distribution of the value domain across the track. */
    scale: SliderScale;
    /** Values the handle is magnetically pulled onto, and that arrow keys walk. */
    detents?: readonly number[];
    /** Subset of `detents` drawn as ticks. Defaults to every detent. */
    tickValues?: readonly number[];
    /** Short unit rendered beside the readout, e.g. `MS`. */
    unit?: string;
    /** Renders the domain bounds beneath the track, each aligned to its own end. */
    showBounds?: boolean;
    /** Plain-language outcome of the current value, rendered beneath the track. */
    consequence?: string;
    /** Short qualifier shown as a chip beside the consequence, e.g. `40 players`. */
    consequenceChip?: string;
    /** Visual scale of the control. */
    density?: SliderDensity;
    /** Blocks all interaction and mutes the control. */
    disabled?: boolean;
    /** Renders a raw value for display. Defaults to the rounded integer. */
    formatValue?: (sliderValue: number) => string;
  }>(),
  {
    detents: () => [],
    tickValues: undefined,
    unit: "",
    showBounds: false,
    consequence: "",
    consequenceChip: "",
    density: "comfortable",
    disabled: false,
    formatValue: (sliderValue: number) => String(Math.round(sliderValue)),
  },
);

/** Current value. Committed on every pointer move and key press. */
const sliderValue = defineModel<number>({ required: true });

const trackElement = useTemplateRef<HTMLElement>("trackElement");

const thumbSize = computed(() => THUMB_SIZE_PX[props.density]);

const sliderConfig = computed(() => ({
  min: props.min,
  max: props.max,
  step: props.step,
  scale: props.scale,
  detents: props.detents,
  thumbSize: thumbSize.value,
}));

const {
  isDragging,
  ratio,
  tickMarks,
  handlePointerDown,
  handlePointerMove,
  handlePointerUp,
  handleKeyDown,
} = usePrecisionSlider(sliderValue, sliderConfig, trackElement);

/**
 * Resolves the track offset expression for a 0..1 position.
 *
 * @remarks
 * [DECISION LOG] Every positioned part resolves through this one expression
 * against the inset travel. Fill, handle and ticks therefore cannot
 * drift apart at any container width.
 *
 * @param position - A track position between `0` and `1`.
 * @returns A CSS length expression for that position.
 */
function getTrackOffset(position: number): string {
  return `calc(var(--ps-thumb) / 2 + ${position} * (100% - var(--ps-thumb)))`;
}

const ticks = computed<readonly SliderTickMark[]>(() => {
  const drawn = props.tickValues;
  return tickMarks.value.filter(
    (tick) =>
      tick.value > props.min &&
      tick.value < props.max &&
      (drawn === undefined || drawn.includes(tick.value)),
  );
});

/**
 * Reserved width for the readout, in `ch`, sized to the widest value the domain
 * can produce.
 *
 * @remarks
 * [THREAT:] A readout that resizes as digits change nudges the label beside it
 * on every drag, so the whole row twitches while the handle moves.
 */
const readoutWidth = computed(() => {
  const widestLength = Math.max(
    props.formatValue(props.min).length,
    props.formatValue(props.max).length,
  );
  return `${widestLength}ch`;
});

const displayValue = computed(() => props.formatValue(sliderValue.value));

const valueText = computed(() => {
  const base = props.unit ? `${displayValue.value} ${props.unit}` : displayValue.value;
  return props.consequence ? `${base}, ${props.consequence}` : base;
});

const rootStyle = computed(() => ({
  "--ps-thumb": `${thumbSize.value}px`,
  "--ps-ratio": String(ratio.value),
}));

/**
 * Starts a drag unless the control is disabled.
 *
 * @param pointerEvent - The originating pointer event.
 */
function handleTrackPointerDown(pointerEvent: PointerEvent): void {
  if (props.disabled) return;
  handlePointerDown(pointerEvent);
}

/**
 * Applies the keyboard contract unless the control is disabled.
 *
 * @remarks
 * [THREAT:] `pointer-events: none` mutes the pointer path but leaves the
 * keyboard one wide open. A disabled slider that still answers arrow keys once
 * anything focuses it programmatically is a real commit from a control the
 * operator was told was inert.
 *
 * @param keyboardEvent - The originating keyboard event.
 */
function handleTrackKeyDown(keyboardEvent: KeyboardEvent): void {
  if (props.disabled) return;
  handleKeyDown(keyboardEvent);
}
</script>

<template>
  <div
    class="precision-slider"
    :data-density="props.density"
    :style="rootStyle"
  >
    <div class="ps-head">
      <span class="ps-label">{{ props.label }}</span>
      <span class="ps-readout">
        <span
          class="ps-readout-digits"
          :style="{ width: readoutWidth }"
        >{{ displayValue }}</span>
        <span
          v-if="props.unit"
          class="ps-readout-unit"
        >{{ props.unit }}</span>
      </span>
    </div>

    <div
      class="ps-hit"
      :class="{ 'is-dragging': isDragging, 'is-disabled': props.disabled }"
      role="slider"
      :tabindex="props.disabled ? -1 : 0"
      :aria-label="props.label"
      :aria-valuemin="props.min"
      :aria-valuemax="props.max"
      :aria-valuenow="Math.round(sliderValue)"
      :aria-valuetext="valueText"
      :aria-disabled="props.disabled ? 'true' : undefined"
      @pointerdown="handleTrackPointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointercancel="handlePointerUp"
      @keydown="handleTrackKeyDown"
    >
      <div
        ref="trackElement"
        class="ps-track"
      >
        <div class="ps-fill" />
        <div
          v-for="tick in ticks"
          :key="tick.value"
          class="ps-tick"
          :style="{ left: getTrackOffset(tick.ratio) }"
          :data-passed="tick.value < sliderValue ? 'true' : undefined"
        />
        <div class="ps-thumb" />
      </div>
    </div>

    <div
      v-if="props.showBounds"
      class="ps-scale"
      aria-hidden="true"
    >
      <span :style="{ left: getTrackOffset(0) }">{{ props.formatValue(props.min) }}</span>
      <span :style="{ left: getTrackOffset(1) }">{{ props.formatValue(props.max) }}</span>
    </div>

    <p
      v-if="props.consequence"
      class="ps-consequence"
    >
      <span
        v-if="props.consequenceChip"
        class="ps-chip"
      >{{ props.consequenceChip }}</span>
      <span>{{ props.consequence }}</span>
    </p>
  </div>
</template>

<style scoped>
/* Density tokens. Every dimension below resolves from these, so a density is a
   token override rather than a second set of rules. */
.precision-slider {
  --ps-track-height: 4px;
  --ps-halo: 40px;
  --ps-hit-height: 48px; /* 48px Mobile Footprint (Target B.2) */
  --ps-tick-width: 2px;
  --ps-tick-height: 10px;
  --ps-readout-size: 19px;

  display: flex;
  flex-direction: column;
  gap: var(--sys-space-8);
  min-width: 0;
}

.precision-slider[data-density="compact"] {
  --ps-track-height: 3px;
  --ps-halo: 32px;
  --ps-hit-height: 40px;
  --ps-tick-height: 8px;
  --ps-readout-size: 15px;

  gap: var(--sys-space-6);
}

.ps-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sys-space-14);
  min-height: 20px;
}

/* A flex item defaults to min-width:auto and refuses to shrink below its own
   content, which would leave a long label overflowing instead of truncating. */
.ps-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 600;
  color: var(--sys-color-on-surface-variant);
}

.ps-readout {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 3px;
  flex-shrink: 0;
  font-family: var(--sys-font-family-mono);
  font-variant-numeric: tabular-nums;
  font-size: var(--ps-readout-size);
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--sys-color-on-surface);
}

.ps-readout-digits {
  display: inline-block;
  text-align: right;
}

.ps-readout-unit {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--sys-color-on-surface-variant);
}

.ps-hit {
  position: relative;
  display: flex;
  align-items: center;
  height: var(--ps-hit-height);
  cursor: pointer;
  touch-action: none;
  outline: none;
  -webkit-tap-highlight-color: transparent;
}

.ps-hit.is-disabled {
  pointer-events: none;
  opacity: 0.38;
}

.ps-track {
  position: relative;
  width: 100%;
  height: var(--ps-track-height);
  border-radius: calc(var(--ps-track-height) / 2);
  background: var(--sys-color-outline-variant);
}

.ps-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: calc(var(--ps-thumb) / 2 + var(--ps-ratio) * (100% - var(--ps-thumb)));
  border-radius: inherit;
  background: var(--sys-color-primary);
}

.ps-hit.is-disabled .ps-fill,
.ps-hit.is-disabled .ps-thumb {
  background: var(--sys-color-outline);
}

.ps-tick {
  position: absolute;
  top: 50%;
  width: var(--ps-tick-width);
  height: var(--ps-tick-height);
  margin-left: calc(var(--ps-tick-width) / -2);
  transform: translateY(-50%);
  border-radius: 1px;
  background: var(--sys-color-outline-variant);
  pointer-events: none;
  transition:
    background var(--sys-motion-duration-200) var(--sys-motion-easing-standard),
    height var(--sys-motion-duration-200) var(--sys-motion-spring);
}

/* [THREAT:] A passed tick tinted with the accent sits on a fill of that same
   accent and disappears, so the track loses its scale exactly where the value
   is. `on-primary` is the one token guaranteed to contrast with the fill in
   both themes. */
.ps-tick[data-passed] {
  background: var(--sys-color-on-primary);
  opacity: 0.5;
}

/* [DECISION LOG] No transition on `left`. Position must track the pointer
   exactly; easing it makes the handle lag the finger and the value appear to
   drift after the drag has stopped. */
.ps-thumb {
  position: absolute;
  top: 50%;
  left: calc(var(--ps-thumb) / 2 + var(--ps-ratio) * (100% - var(--ps-thumb)));
  width: var(--ps-thumb);
  height: var(--ps-thumb);
  margin-left: calc(var(--ps-thumb) / -2);
  transform: translateY(-50%);
  border-radius: 50%;
  background: var(--sys-color-primary);
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.28),
    0 2px 6px rgba(0, 0, 0, 0.12);
  pointer-events: none;
}

/* The halo responds; the handle itself never resizes. A handle that grows under
   the finger moves its own centre, and the value looks like it drifted. */
.ps-thumb::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: var(--ps-halo);
  height: var(--ps-halo);
  margin: calc(var(--ps-halo) / -2) 0 0 calc(var(--ps-halo) / -2);
  border-radius: 50%;
  background: var(--sys-color-primary);
  opacity: 0;
  transform: scale(0.55);
  transition:
    opacity var(--sys-motion-duration-200) var(--sys-motion-easing-standard),
    transform var(--sys-motion-duration-200) var(--sys-motion-spring);
}

.ps-hit:hover .ps-thumb::after {
  opacity: 0.13;
  transform: scale(1);
}

.ps-hit:focus-visible .ps-thumb::after {
  opacity: 0.22;
  transform: scale(1.1);
}

.ps-hit.is-dragging .ps-thumb::after {
  opacity: 0.26;
  transform: scale(1.2);
}

/* A second, harder signal than the halo, for a keyboard user on a track that
   may sit over a busy surface.

   [DECISION LOG] `outline` with an offset rather than a stacked box-shadow ring.
   A shadow ring has to paint its own gap in some colour, and the only colour
   available to a Layer 2 primitive is the page background, which is wrong the
   moment the slider sits on a card. An outline offset leaves the gap
   transparent, so the ring reads correctly on every surface. */
.ps-hit:focus-visible .ps-thumb {
  outline: 2px solid var(--sys-color-primary);
  outline-offset: 2px;
}

/* [DECISION LOG] ABSOLUTE, NOT DISTRIBUTED:
   A `space-between` row spaces labels evenly, which only matches the ticks on a
   linear scale. On the logarithmic dwell track it put every label up to 44px
   from the tick it named, on a 285px track. Each bound now resolves through the
   same offset expression as the ticks and the handle, so it cannot drift.
   Only the bounds are labelled: the interior detents compress towards the top
   of a log scale until their labels collide, and the readout already states the
   exact current value. */
.ps-scale {
  position: relative;
  height: 13px;
  margin-top: -2px;
  font-family: var(--sys-font-family-mono);
  font-variant-numeric: tabular-nums;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: var(--sys-color-on-surface-variant);
  opacity: 0.72;
}

.ps-scale span {
  position: absolute;
  transform: translateX(-50%);
  white-space: nowrap;
}

.ps-consequence {
  display: flex;
  align-items: center;
  gap: var(--sys-space-8);
  margin: 0;
  min-height: 22px;
  font-size: 13px;
  color: var(--sys-color-on-surface-variant);
}

.ps-chip {
  flex-shrink: 0;
  padding: 3px 7px;
  border-radius: var(--sys-shape-corner-badge);
  background: var(--sys-color-surface-container-highest);
  font-family: var(--sys-font-family-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--sys-color-on-surface-variant);
}

@media (prefers-reduced-motion: reduce) {
  .ps-tick,
  .ps-thumb::after {
    transition-duration: 0.01ms;
  }
}
</style>
