// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { computed, ref, type ComputedRef, type Ref } from "vue";
import { SLIDER_SNAP_RADIUS_PX } from "@core";

/**
 * Distribution of a slider's value domain across its track.
 *
 * @remarks
 * `log` is for quantities perceived multiplicatively, where a fixed ratio rather
 * than a fixed difference is the constant subjective step. Blitz dwell time is
 * one: 850ms to 1700ms is the same felt jump as 3000ms to 6000ms, so a linear
 * track would compress the entire useful region into its first quarter.
 */
export type SliderScale = "linear" | "log";

/**
 * Domain and geometry description for a single slider instance.
 *
 * @remarks
 * Supplied as a `Ref` (typically a `computed` over props) so a consumer whose
 * bounds or density change at runtime stays in sync without re-invoking the
 * composable.
 */
export interface PrecisionSliderConfig {
  /** Lowest selectable value. Must be greater than zero when `scale` is `log`. */
  min: number;
  /** Highest selectable value. */
  max: number;
  /** Granularity applied to values that do not land on a detent. */
  step: number;
  /** Distribution of the value domain across the track. */
  scale: SliderScale;
  /** Values the handle is magnetically pulled onto, and that arrow keys walk. */
  detents: readonly number[];
  /** Rendered handle diameter in pixels. Travel is inset by half of it at each end. */
  thumbSize: number;
}

/**
 * Reactive surface returned by {@link usePrecisionSlider}.
 */
export interface PrecisionSliderApi {
  /** True for the duration of a pointer drag. */
  isDragging: Ref<boolean>;
  /** Current value expressed as a 0..1 position along the track. */
  ratio: ComputedRef<number>;
  /** Every detent that should be drawn as a tick, with its own track position. */
  tickMarks: ComputedRef<readonly SliderTickMark[]>;
  /** Pointer press: captures the pointer and commits the value under it. */
  handlePointerDown: (pointerEvent: PointerEvent) => void;
  /** Pointer drag: commits the value under the pointer while captured. */
  handlePointerMove: (pointerEvent: PointerEvent) => void;
  /**
   * Pointer release or cancellation: releases capture and ends the drag.
   *
   * @returns The value committed during the drag, or `null` if none was.
   */
  handlePointerUp: (pointerEvent: PointerEvent) => number | null;
  /**
   * Keyboard stepping across detents, fine steps, and the domain bounds.
   *
   * @returns The newly committed value, or `null` when nothing changed.
   */
  handleKeyDown: (keyboardEvent: KeyboardEvent) => number | null;
}

/**
 * A detent resolved to its drawn position on the track.
 */
export interface SliderTickMark {
  /** The detent's value in the slider's own domain. */
  value: number;
  /** That detent's 0..1 position along the track. */
  ratio: number;
}

/**
 * COMPOSABLE: usePrecisionSlider
 *
 * @remarks
 * Single source of truth for slider interaction across the stack. Owns the
 * value/position mapping, magnetic detents, pointer capture and keyboard
 * contract; owns no markup, so each consumer renders the presentation its
 * context demands (a full-width settings row, a 48px console-header pill)
 * without either forking the behaviour.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 2 Shared Composable (@shared/composables).
 * - **Role:** Domain-blind interaction logic for every slider surface.
 * - **Satisfaction:** ADR Section I (SSOT, SRP), Section II (Unitary Architecture).
 *
 * [DECISION LOG] TRAVEL INSET:
 * The handle centre travels between `thumbSize / 2` and `width - thumbSize / 2`,
 * never the full 0 to 100%. Without the inset, at both extremes half the handle
 * overhangs the track it is meant to sit on, and a tick at the maximum lands
 * beyond the handle rather than under it. Pointer mapping, the rendered fill and
 * every tick resolve through this same inset travel, which is the only reason
 * they stay aligned at arbitrary container widths.
 *
 * [DECISION LOG] MAGNETIC, NOT QUANTISED:
 * A drag within `SLIDER_SNAP_RADIUS_PX` of a detent is pulled onto it, but every
 * value the step permits remains reachable. Hard quantisation onto detents would
 * discard the reason for offering a slider instead of a button group.
 *
 * @param value - The `defineModel` ref holding the committed value.
 * @param config - Reactive domain and geometry description.
 * @param trackElement - Template ref to the rendered track. Owned by the
 *   consuming component, since only it can populate one; pointer geometry is
 *   measured from this element.
 *
 * @returns The reactive surface described by {@link PrecisionSliderApi}.
 *
 * @sideeffects
 * - Captures and releases the active pointer on the element receiving the event.
 * - Reads layout geometry from `trackElement` during pointer interaction.
 */
export function usePrecisionSlider(
  value: Ref<number>,
  config: Ref<PrecisionSliderConfig>,
  trackElement: Readonly<Ref<HTMLElement | null>>,
): PrecisionSliderApi {
  const isDragging = ref(false);

  /**
   * The most recent value committed by the pointer path.
   *
   * @remarks
   * [DECISION LOG] REPORTED, NOT READ BACK:
   * A consumer needs to know what a gesture settled on so it can publish it
   * onward. Reading the bound model straight after writing it is unreliable,
   * because a `defineModel` round-trips through the parent and may still report
   * the previous value inside the same handler. Reporting the number this
   * composable itself computed removes the race entirely.
   */
  let committedDuringDrag: number | null = null;

  /**
   * Resolves the scale actually used for mapping.
   *
   * @remarks
   * [THREAT:] A `log` scale over a domain reaching zero or below yields
   * `Math.log(0) === -Infinity` and propagates `NaN` into every derived
   * position, collapsing the rendered control silently rather than loudly.
   *
   * [DECISION LOG] The mapping degrades to `linear` for such a domain. The
   * fallback is deterministic and documented rather than hidden: a `log` slider
   * is only meaningful over a strictly positive domain, and no consumer in the
   * stack declares one that is not.
   */
  const activeScale = computed<SliderScale>(() =>
    config.value.scale === "log" && config.value.min > 0 ? "log" : "linear",
  );

  /**
   * Constrains a value to the configured domain.
   *
   * @param candidate - The unconstrained value.
   * @returns The value clamped between `min` and `max`.
   */
  function clampToDomain(candidate: number): number {
    const { min, max } = config.value;
    if (candidate < min) return min;
    if (candidate > max) return max;
    return candidate;
  }

  /**
   * Maps a domain value onto its 0..1 position along the track.
   *
   * @param candidate - A value within the configured domain.
   * @returns The corresponding track position, or `0` for a degenerate domain.
   */
  function getRatioForValue(candidate: number): number {
    const { min, max } = config.value;

    // [THREAT:] A zero-width domain divides by zero and poisons every position.
    if (max === min) return 0;

    if (activeScale.value === "log") {
      const lowerBound = Math.log(min);
      const upperBound = Math.log(max);
      return (Math.log(clampToDomain(candidate)) - lowerBound) / (upperBound - lowerBound);
    }

    return (clampToDomain(candidate) - min) / (max - min);
  }

  /**
   * Maps a 0..1 track position back onto a domain value.
   *
   * @param position - A track position between `0` and `1`.
   * @returns The corresponding unquantised domain value.
   */
  function getValueForRatio(position: number): number {
    const { min, max } = config.value;

    if (activeScale.value === "log") {
      const lowerBound = Math.log(min);
      const upperBound = Math.log(max);
      return Math.exp(lowerBound + position * (upperBound - lowerBound));
    }

    return min + position * (max - min);
  }

  /**
   * Rounds a value onto the configured step grid.
   *
   * @remarks
   * [DECISION LOG] The grid is anchored to `min`, not to zero. Anchoring to zero
   * makes the minimum itself unreachable whenever `step` does not divide it
   * evenly, which is exactly the case for the 1-crown and 850ms domains.
   *
   * @param candidate - The unquantised value.
   * @returns The value snapped to the nearest step, clamped to the domain.
   */
  function getSteppedValue(candidate: number): number {
    const { min, step } = config.value;
    if (step <= 0) return clampToDomain(candidate);
    return clampToDomain(min + Math.round((candidate - min) / step) * step);
  }

  /**
   * Finds the detent nearest a track position, if one lies within the snap radius.
   *
   * @remarks
   * Proximity is measured in rendered pixels rather than in domain units, so the
   * pull feels identical at both ends of a logarithmic track.
   *
   * @param position - The pointer's 0..1 track position.
   * @param travelWidth - The inset travel width in pixels.
   * @returns The detent to snap onto, or `null` when none is close enough.
   */
  function getSnapCandidate(position: number, travelWidth: number): number | null {
    let closestDetent: number | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const detent of config.value.detents) {
      const distance = Math.abs(getRatioForValue(detent) - position) * travelWidth;
      if (distance < closestDistance) {
        closestDistance = distance;
        closestDetent = detent;
      }
    }

    return closestDistance <= SLIDER_SNAP_RADIUS_PX ? closestDetent : null;
  }

  /**
   * Commits the value corresponding to a horizontal viewport coordinate.
   *
   * @param clientX - The pointer's horizontal viewport coordinate.
   */
  function setValueFromClientX(clientX: number): void {
    const track = trackElement.value;
    if (!track) return;

    const { thumbSize } = config.value;
    const bounds = track.getBoundingClientRect();
    const travelWidth = bounds.width - thumbSize;

    // [THREAT:] A collapsed or not-yet-laid-out track divides by zero.
    if (travelWidth <= 0) return;

    const position = Math.min(
      1,
      Math.max(0, (clientX - bounds.left - thumbSize / 2) / travelWidth),
    );

    const snapCandidate = getSnapCandidate(position, travelWidth);
    const committedValue = snapCandidate ?? getSteppedValue(getValueForRatio(position));

    committedDuringDrag = committedValue;
    value.value = committedValue;
  }

  /**
   * Resolves the detent adjacent to the current value in a given direction.
   *
   * @param direction - `1` to walk upward, `-1` to walk downward.
   * @returns The adjacent detent, or `null` when none remains that way.
   */
  function getAdjacentDetent(direction: number): number | null {
    // [DECISION LOG] A half-unit margin keeps a value sitting exactly on a detent
    // from matching itself and stalling the walk.
    const ordered = [...config.value.detents].sort((first, second) =>
      direction > 0 ? first - second : second - first,
    );

    for (const detent of ordered) {
      const isBeyond = direction > 0 ? detent > value.value + 0.5 : detent < value.value - 0.5;
      if (isBeyond) return detent;
    }

    return null;
  }

  const ratio = computed(() => getRatioForValue(value.value));

  const tickMarks = computed<readonly SliderTickMark[]>(() =>
    config.value.detents.map((detent) => ({
      value: detent,
      ratio: getRatioForValue(detent),
    })),
  );

  /**
   * Begins a drag and commits the value under the pointer.
   *
   * @param pointerEvent - The originating pointer event.
   */
  function handlePointerDown(pointerEvent: PointerEvent): void {
    const target = pointerEvent.currentTarget as HTMLElement | null;
    // [DECISION LOG] Capture keeps the drag alive once the pointer leaves the
    // track, which is the normal case on a 4px target.
    target?.setPointerCapture?.(pointerEvent.pointerId);
    committedDuringDrag = null;
    isDragging.value = true;
    setValueFromClientX(pointerEvent.clientX);
    pointerEvent.preventDefault();
  }

  /**
   * Continues an active drag.
   *
   * @param pointerEvent - The originating pointer event.
   */
  function handlePointerMove(pointerEvent: PointerEvent): void {
    if (!isDragging.value) return;
    setValueFromClientX(pointerEvent.clientX);
  }

  /**
   * Ends a drag and releases pointer capture.
   *
   * @param pointerEvent - The originating pointer event.
   * @returns The value committed during the drag, or `null` if none was.
   */
  function handlePointerUp(pointerEvent: PointerEvent): number | null {
    const target = pointerEvent.currentTarget as HTMLElement | null;
    if (target?.hasPointerCapture?.(pointerEvent.pointerId)) {
      target.releasePointerCapture(pointerEvent.pointerId);
    }

    const committedValue = isDragging.value ? committedDuringDrag : null;
    isDragging.value = false;
    committedDuringDrag = null;
    return committedValue;
  }

  /**
   * Applies the keyboard contract.
   *
   * @remarks
   * Arrow keys walk detent to detent so the meaningful values are reachable
   * without counting steps; `Shift` reduces them to a single `step` for fine
   * tuning; `Home` and `End` jump to the domain bounds.
   *
   * @param keyboardEvent - The originating keyboard event.
   */
  function handleKeyDown(keyboardEvent: KeyboardEvent): number | null {
    const { key, shiftKey } = keyboardEvent;
    const { min, max, step, detents } = config.value;

    const direction = key === "ArrowRight" || key === "ArrowUp" ? 1
      : key === "ArrowLeft" || key === "ArrowDown" ? -1
        : 0;

    if (direction === 0 && key !== "Home" && key !== "End") return null;
    keyboardEvent.preventDefault();

    // [DECISION LOG] One commit point, so every branch reports identically and a
    // key that resolves to the value already held publishes nothing.
    let nextValue: number;

    if (key === "Home") {
      nextValue = min;
    } else if (key === "End") {
      nextValue = max;
    } else if (shiftKey || detents.length === 0) {
      nextValue = clampToDomain(value.value + direction * step);
    } else {
      nextValue = getAdjacentDetent(direction) ?? clampToDomain(value.value + direction * step);
    }

    if (nextValue === value.value) return null;

    value.value = nextValue;
    return nextValue;
  }

  return {
    isDragging,
    ratio,
    tickMarks,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleKeyDown,
  };
}
