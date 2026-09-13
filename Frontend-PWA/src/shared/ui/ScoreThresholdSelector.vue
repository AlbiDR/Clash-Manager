<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->

<script setup lang="ts">
import { computed, useTemplateRef } from "vue";
import { vTactile } from "../directives/vTactile";
import { usePrecisionSlider, type SliderTickMark } from "../composables/usePrecisionSlider";
import {
  SCORE_THRESHOLD_DETENTS,
  SCORE_THRESHOLD_MAX,
  SCORE_THRESHOLD_MIN,
  SCORE_THRESHOLD_STEP,
  SCORE_TICK_INTERVAL,
} from "@core";

/**
 * SHARED UI: ScoreThresholdSelector (Layer 2)
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 2 (@shared/ui)
 * - **Role:** Interactive Molecule. Score-band selector for the console header,
 *   used by Roster and Headhunter through `SelectionBar`.
 * - **Satisfaction:** ADR Section II (Unitary Architecture), Section IV (Tactile
 *   Interaction), Target B.2 (48px touch footprint).
 *
 * [DECISION LOG] THE PILL IS THE SLIDER:
 * The previous control opened a horizontally scrolling row of seven fixed stops
 * on tap, so choosing a band cost a tap, a scroll and a second tap, and the stops
 * were 15 points apart. The whole 48px footprint is now the drag surface: the
 * numeral holds still while a hairline beneath it carries position. That is what
 * makes a 5-point step affordable, since 21 stops is unusable as a button row but
 * costs a slider nothing.
 *
 * [DECISION LOG] LOGIC DELEGATION:
 * Interaction comes from `usePrecisionSlider`, shared with the full-width
 * `PrecisionSlider`. This component owns only the compact presentation, so the
 * two surfaces cannot drift apart in how they snap, step or clamp.
 *
 * [DECISION LOG] THE FILL ENCODES THE PREDICATE:
 * On a greater-or-equal filter the fill runs from the handle position to the
 * right edge; on less-or-equal it runs to the left. The bar therefore shows the
 * surviving band, and the filter reads without parsing the symbol.
 */

const props = defineProps<{
  /** Disables all interactions when true. */
  disabled?: boolean;
}>();

/** Comparison mode: 'ge' (Greater than or equal) or 'le' (Less than or equal). */
const mode = defineModel<"ge" | "le">("mode", { required: true });
/** Current active score threshold. */
const value = defineModel<number>("value", { required: true });

const emit = defineEmits<{
  /** Emitted when a selection is finalized (value or mode changed). */
  (event: "select", thresholdValue: number, thresholdMode: "ge" | "le"): void;
}>();

const trackElement = useTemplateRef<HTMLElement>("trackElement");

/**
 * Slider geometry for the compact pill.
 *
 * @remarks
 * [DECISION LOG] A zero handle diameter is deliberate, not a placeholder. This
 * variant draws no separate handle, so the travel needs no inset and the fill is
 * free to reach both edges of the track.
 */
const sliderConfig = computed(() => ({
  min: SCORE_THRESHOLD_MIN,
  max: SCORE_THRESHOLD_MAX,
  step: SCORE_THRESHOLD_STEP,
  scale: "linear" as const,
  detents: SCORE_THRESHOLD_DETENTS,
  thumbSize: 0,
}));

const {
  isDragging,
  ratio,
  tickMarks,
  handlePointerDown,
  handlePointerMove,
  handlePointerUp,
  handleKeyDown,
} = usePrecisionSlider(value, sliderConfig, trackElement);

/**
 * The detents actually drawn on the track.
 *
 * @remarks
 * [DECISION LOG] Drawing all 21 detents inside a 48px pill produces a solid band
 * that reads as texture rather than as a scale. Quartile marks orient the eye
 * while the detents underneath stay at 5.
 */
const ticks = computed<readonly SliderTickMark[]>(() =>
  tickMarks.value.filter(
    (tick) =>
      tick.value % SCORE_TICK_INTERVAL === 0 &&
      tick.value > SCORE_THRESHOLD_MIN &&
      tick.value < SCORE_THRESHOLD_MAX,
  ),
);

const comparisonSymbol = computed(() => (mode.value === "ge" ? "≥" : "≤"));

const valueText = computed(() =>
  `${Math.round(value.value)} ${mode.value === "ge" ? "or above" : "or below"}`,
);

const pillStyle = computed(() => ({ "--sp-ratio": String(ratio.value) }));

/**
 * Switches the comparison direction and republishes the selection.
 *
 * @remarks
 * [DECISION LOG] AUTO-APPLY: A mode flip is a discrete, deliberate act, so the
 * selection is republished immediately rather than waiting for a further gesture.
 */
function handleModeToggle(): void {
  if (props.disabled) return;
  // [THREAT:] A `defineModel` round-trips through the parent, so reading it back
  // inside the same handler can still report the previous mode and publish a
  // selection for the direction the operator just left.
  const nextMode = mode.value === "ge" ? "le" : "ge";
  mode.value = nextMode;
  emit("select", value.value, nextMode);
}

/**
 * Begins a drag unless the control is disabled.
 *
 * @param pointerEvent - The originating pointer event.
 */
function handleTrackPointerDown(pointerEvent: PointerEvent): void {
  if (props.disabled) return;
  handlePointerDown(pointerEvent);
}

/**
 * Ends a drag and republishes the selection once.
 *
 * @remarks
 * [THREAT:] `select` drives `handleSelectScore`, which rebuilds the batch
 * selection and can force selection mode on or off. Emitting it on every pointer
 * move would rebuild that selection continuously for the length of a drag and
 * flicker the action button each time the match count crossed zero.
 *
 * [DECISION LOG] The bound value still updates live through `v-model`, so the
 * numeral and the track follow the finger; only the selection commit waits for
 * release, which is the same cost profile the tap-driven control had.
 *
 * @param pointerEvent - The originating pointer event.
 */
function handleTrackPointerUp(pointerEvent: PointerEvent): void {
  const committedValue = handlePointerUp(pointerEvent);
  if (committedValue !== null) emit("select", committedValue, mode.value);
}

/**
 * Applies the keyboard contract and republishes the selection.
 *
 * @remarks
 * Every key press is already a discrete commit, so each one publishes.
 *
 * @param keyboardEvent - The originating keyboard event.
 */
function handleTrackKeyDown(keyboardEvent: KeyboardEvent): void {
  if (props.disabled) return;
  const committedValue = handleKeyDown(keyboardEvent);
  if (committedValue !== null) emit("select", committedValue, mode.value);
}
</script>

<template>
  <div
    class="score-pill-group"
    :class="{ disabled: props.disabled }"
    :data-mode="mode"
    :style="pillStyle"
  >
    <!-- Comparison Mode Toggle -->
    <button
      v-tactile
      class="mode-toggle"
      type="button"
      :disabled="props.disabled"
      :title="mode === 'ge' ? 'Greater than or equal' : 'Less than or equal'"
      @click="handleModeToggle"
    >
      <span class="mode-symbol">{{ comparisonSymbol }}</span>
    </button>

    <!-- Threshold Slider: the whole surface is the drag target -->
    <div
      class="sp-slider"
      :class="{ 'is-dragging': isDragging }"
      role="slider"
      aria-label="Score threshold"
      :tabindex="props.disabled ? -1 : 0"
      :aria-valuemin="SCORE_THRESHOLD_MIN"
      :aria-valuemax="SCORE_THRESHOLD_MAX"
      :aria-valuenow="Math.round(value)"
      :aria-valuetext="valueText"
      :aria-disabled="props.disabled ? 'true' : undefined"
      @pointerdown="handleTrackPointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handleTrackPointerUp"
      @pointercancel="handleTrackPointerUp"
      @keydown="handleTrackKeyDown"
    >
      <span class="sp-label">{{ Math.round(value) }}</span>
      <div
        ref="trackElement"
        class="sp-track"
      >
        <div class="sp-fill" />
        <div
          v-for="tick in ticks"
          :key="tick.value"
          class="sp-tick"
          :style="{ left: `${tick.ratio * 100}%` }"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.score-pill-group {
  position: relative;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  flex: 0 0 auto;
  gap: var(--sys-space-4);
  min-width: 104px;
  height: 48px; /* 48px Mobile Footprint (Target B.2) */
  padding: var(--sys-space-4);
  border: 1px solid var(--sys-color-outline-variant);
  border-radius: var(--sys-shape-corner-medium);
  background: var(--sys-color-surface-container-highest);
  transition: border-color var(--sys-motion-duration-200) var(--sys-motion-easing-standard);
}

.score-pill-group.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.score-pill-group:focus-within {
  border-color: var(--sys-color-primary);
}

.mode-toggle {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: var(--sys-shape-corner-stat);
  background: var(--sys-color-primary-container);
  color: var(--sys-color-on-primary-container);
  cursor: pointer;
  transition: transform var(--sys-motion-duration-200) var(--sys-motion-spring);
}

/* [DECISION LOG] BLED VERTICALLY, NOT HORIZONTALLY:
   Both controls sit inside a 48px pill with 4px of padding, so 40px tall is
   all the box allows and neither can simply grow. Four pixels of vertical
   bleed reclaims the padding and brings each to the full 48px height.
   Horizontal bleed is deliberately not applied: these two are siblings 4px
   apart, so widening both would make their hit areas meet in the gap and a tap
   there would be ambiguous. A slightly narrow target beats one that activates
   the wrong control. */
.mode-toggle::after,
.sp-slider::after {
  content: "";
  position: absolute;
  inset: calc(-1 * var(--sys-space-4)) 0;
}

.mode-toggle:active {
  transform: scale(0.85) rotate(-15deg);
}

.mode-symbol {
  font-family: var(--sys-font-family-mono);
  font-size: 18px;
  font-weight: 700;
}

/* The entire remaining footprint is the drag surface; there is no separate
   handle to aim at, which is the only way a slider fits in 48px. */
.sp-slider {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-width: 0;
  gap: 5px;
  height: 40px;
  padding: 0 var(--sys-space-8);
  border-radius: var(--sys-shape-corner-small);
  cursor: ew-resize;
  touch-action: none;
  outline: none;
  -webkit-tap-highlight-color: transparent;
}

.sp-slider:focus-visible {
  background: var(--sys-color-surface-container-high);
}

/* Tabular figures hold the numeral still as the value changes; without them the
   digits reflow under the finger and the pill appears to breathe. */
.sp-label {
  font-family: var(--sys-font-family-mono);
  font-variant-numeric: tabular-nums;
  font-size: 15px;
  font-weight: 700;
  line-height: 1;
  min-width: 3ch;
  text-align: center;
  color: var(--sys-color-on-surface);
}

.sp-track {
  position: relative;
  width: 100%;
  height: 3px;
  border-radius: 2px;
  background: var(--sys-color-outline-variant);
}

/* Less-or-equal keeps the band below the handle, so the fill runs from the left
   edge up to it. */
.sp-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: calc(var(--sp-ratio) * 100%);
  border-radius: inherit;
  background: var(--sys-color-primary);
}

/* Greater-or-equal keeps the band above the handle, so the fill re-anchors to
   the right edge. */
.score-pill-group[data-mode="ge"] .sp-fill {
  left: calc(var(--sp-ratio) * 100%);
  right: 0;
  width: auto;
}

.sp-tick {
  position: absolute;
  top: 50%;
  width: 2px;
  height: 3px;
  margin-left: -1px;
  transform: translateY(-50%);
  background: var(--sys-color-surface-container-highest);
  opacity: 0.9;
  pointer-events: none;
}
</style>
