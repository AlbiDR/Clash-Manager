// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { computed, ref } from "vue";
import {
  usePrecisionSlider,
  type PrecisionSliderConfig,
} from "../usePrecisionSlider";

/** Width used for every stubbed track, chosen so 1px maps to a clean ratio. */
const TRACK_WIDTH = 200;
/** Left offset of every stubbed track, so client coordinates are not ratios by accident. */
const TRACK_LEFT = 40;

/**
 * Builds a slider over a stubbed track of known geometry.
 *
 * @remarks
 * jsdom reports a zero-sized rect for every element, which would make the
 * pointer path a silent no-op. Stubbing the rect is what gives these tests a
 * real coordinate space to assert against.
 *
 * @param overrides - Config fields to apply over the linear 0..100 default.
 * @param initialValue - Starting value.
 * @returns The slider api, its value ref, and a pointer-coordinate helper.
 */
function createSlider(
  overrides: Partial<PrecisionSliderConfig> = {},
  initialValue = 50,
) {
  const value = ref(initialValue);
  const config = computed<PrecisionSliderConfig>(() => ({
    min: 0,
    max: 100,
    step: 1,
    scale: "linear",
    detents: [],
    thumbSize: 0,
    ...overrides,
  }));

  const track = {
    getBoundingClientRect: () => ({ left: TRACK_LEFT, width: TRACK_WIDTH }),
  } as unknown as HTMLElement;

  const slider = usePrecisionSlider(value, config, ref(track));

  /**
   * Presses the pointer at a fractional position along the track.
   *
   * @param position - A 0..1 position.
   */
  function pressAt(position: number): void {
    const thumbSize = config.value.thumbSize;
    const travel = TRACK_WIDTH - thumbSize;
    slider.handlePointerDown({
      clientX: TRACK_LEFT + thumbSize / 2 + position * travel,
      pointerId: 1,
      currentTarget: null,
      preventDefault: vi.fn(),
    } as unknown as PointerEvent);
  }

  /**
   * Sends a key to the slider.
   *
   * @param key - The key name.
   * @param shiftKey - Whether Shift is held.
   */
  function press(key: string, shiftKey = false): void {
    slider.handleKeyDown({
      key,
      shiftKey,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent);
  }

  return { slider, value, pressAt, press };
}

describe("usePrecisionSlider", () => {
  describe("value and position mapping", () => {
    it("maps a linear domain proportionally", () => {
      const { slider, value } = createSlider({}, 25);
      expect(slider.ratio.value).toBeCloseTo(0.25, 5);
      value.value = 75;
      expect(slider.ratio.value).toBeCloseTo(0.75, 5);
    });

    it("maps a logarithmic domain by ratio, not by difference", () => {
      // 850 to 6000 spans a factor of ~7.06. Its geometric midpoint, ~2258, must
      // therefore sit at the halfway point of the track rather than 3425 would.
      const { slider } = createSlider(
        { min: 850, max: 6000, scale: "log" },
        Math.sqrt(850 * 6000),
      );
      expect(slider.ratio.value).toBeCloseTo(0.5, 5);
    });

    it("places the arithmetic midpoint past halfway on a logarithmic track", () => {
      const { slider } = createSlider({ min: 850, max: 6000, scale: "log" }, 3425);
      expect(slider.ratio.value).toBeGreaterThan(0.6);
    });

    it("returns a zero position for a degenerate domain", () => {
      const { slider } = createSlider({ min: 10, max: 10 }, 10);
      expect(slider.ratio.value).toBe(0);
    });

    it("falls back to linear when a logarithmic domain reaches zero", () => {
      // Math.log(0) is -Infinity and would poison every derived position with NaN.
      const { slider } = createSlider({ min: 0, max: 100, scale: "log" }, 50);
      expect(Number.isFinite(slider.ratio.value)).toBe(true);
      expect(slider.ratio.value).toBeCloseTo(0.5, 5);
    });
  });

  describe("pointer commitment", () => {
    it("commits the value under the pointer", () => {
      const { value, pressAt } = createSlider({}, 0);
      pressAt(0.4);
      expect(value.value).toBe(40);
    });

    it("clamps a pointer beyond either end to the domain bounds", () => {
      const { value, pressAt } = createSlider({}, 50);
      pressAt(-2);
      expect(value.value).toBe(0);
      pressAt(3);
      expect(value.value).toBe(100);
    });

    it("insets the travel by half the handle so the extremes stay reachable", () => {
      // With an 18px handle on a 200px track the usable travel is 182px, and the
      // handle centre at either extreme sits 9px inside the track edge.
      const { value, pressAt } = createSlider({ thumbSize: 18 }, 50);
      pressAt(0);
      expect(value.value).toBe(0);
      pressAt(1);
      expect(value.value).toBe(100);
    });

    it("pulls onto a detent within the snap radius", () => {
      // 0.5 is 100px along a 200px track; detent 52 sits at 104px, 4px away.
      const { value, pressAt } = createSlider({ detents: [52] }, 0);
      pressAt(0.5);
      expect(value.value).toBe(52);
    });

    it("leaves a detent outside the snap radius alone", () => {
      // Detent 60 sits at 120px, 20px from the press, well beyond the 6px radius.
      const { value, pressAt } = createSlider({ detents: [60] }, 0);
      pressAt(0.5);
      expect(value.value).toBe(50);
    });

    it("rounds onto a step grid anchored to the minimum, not to zero", () => {
      // A grid anchored to zero could never produce the minimum itself when the
      // step does not divide it, which is exactly the 1-crown and 850ms case.
      const { value, pressAt } = createSlider({ min: 1, max: 101, step: 10 }, 50);
      pressAt(0);
      expect(value.value).toBe(1);
      pressAt(0.1);
      expect(value.value).toBe(11);
    });

    it("ignores a press on a track that has no width", () => {
      const value = ref(50);
      const config = computed<PrecisionSliderConfig>(() => ({
        min: 0, max: 100, step: 1, scale: "linear", detents: [], thumbSize: 0,
      }));
      const collapsed = {
        getBoundingClientRect: () => ({ left: 0, width: 0 }),
      } as unknown as HTMLElement;
      const slider = usePrecisionSlider(value, config, ref(collapsed));

      slider.handlePointerDown({
        clientX: 25, pointerId: 1, currentTarget: null, preventDefault: vi.fn(),
      } as unknown as PointerEvent);

      expect(value.value).toBe(50);
    });

    it("only follows a move while a drag is active", () => {
      const { slider, value } = createSlider({}, 50);
      slider.handlePointerMove({ clientX: TRACK_LEFT } as unknown as PointerEvent);
      expect(value.value).toBe(50);
      expect(slider.isDragging.value).toBe(false);
    });

    it("tracks the drag lifecycle", () => {
      const { slider, pressAt } = createSlider({}, 50);
      pressAt(0.5);
      expect(slider.isDragging.value).toBe(true);
      slider.handlePointerUp({ pointerId: 1, currentTarget: null } as unknown as PointerEvent);
      expect(slider.isDragging.value).toBe(false);
    });
  });

  describe("keyboard contract", () => {
    it("walks to the adjacent detent", () => {
      const { value, press } = createSlider({ detents: [0, 25, 50, 75, 100] }, 50);
      press("ArrowRight");
      expect(value.value).toBe(75);
      press("ArrowLeft");
      expect(value.value).toBe(50);
    });

    it("treats up and down as the same axis", () => {
      const { value, press } = createSlider({ detents: [0, 25, 50, 75, 100] }, 50);
      press("ArrowUp");
      expect(value.value).toBe(75);
      press("ArrowDown");
      expect(value.value).toBe(50);
    });

    it("reduces to a single step when Shift is held", () => {
      const { value, press } = createSlider({ detents: [0, 25, 50, 75, 100], step: 1 }, 50);
      press("ArrowRight", true);
      expect(value.value).toBe(51);
    });

    it("falls back to a step when no detent remains in that direction", () => {
      const { value, press } = createSlider({ detents: [25], step: 5 }, 50);
      press("ArrowRight");
      expect(value.value).toBe(55);
    });

    it("steps when the slider declares no detents at all", () => {
      const { value, press } = createSlider({ detents: [], step: 5 }, 50);
      press("ArrowRight");
      expect(value.value).toBe(55);
    });

    it("jumps to the domain bounds", () => {
      const { value, press } = createSlider({}, 50);
      press("Home");
      expect(value.value).toBe(0);
      press("End");
      expect(value.value).toBe(100);
    });

    it("clamps a step at the domain edge", () => {
      const { value, press } = createSlider({ detents: [], step: 10 }, 95);
      press("ArrowRight");
      expect(value.value).toBe(100);
    });

    it("ignores keys outside its contract", () => {
      const { value, press } = createSlider({}, 50);
      press("Enter");
      press("a");
      expect(value.value).toBe(50);
    });
  });

  describe("reported commits", () => {
    // A consumer publishes a gesture onward, and reading the bound model straight
    // after writing it can still report the previous value. These returns are
    // what remove that race.

    it("returns the value a key press committed", () => {
      const { slider } = createSlider({ detents: [0, 25, 50, 75, 100] }, 50);

      expect(
        slider.handleKeyDown({ key: "ArrowRight", shiftKey: false, preventDefault: vi.fn() } as unknown as KeyboardEvent),
      ).toBe(75);
    });

    it("returns null for a key that changes nothing", () => {
      const { slider } = createSlider({}, 100);

      expect(
        slider.handleKeyDown({ key: "End", shiftKey: false, preventDefault: vi.fn() } as unknown as KeyboardEvent),
      ).toBeNull();
    });

    it("returns null for a key outside the contract", () => {
      const { slider } = createSlider({}, 50);

      expect(
        slider.handleKeyDown({ key: "Enter", shiftKey: false, preventDefault: vi.fn() } as unknown as KeyboardEvent),
      ).toBeNull();
    });

    it("returns the value a drag settled on", () => {
      const { slider, pressAt } = createSlider({}, 0);
      pressAt(0.3);

      expect(
        slider.handlePointerUp({ pointerId: 1, currentTarget: null } as unknown as PointerEvent),
      ).toBe(30);
    });

    it("returns null for a release that never dragged", () => {
      const { slider } = createSlider({}, 50);

      expect(
        slider.handlePointerUp({ pointerId: 1, currentTarget: null } as unknown as PointerEvent),
      ).toBeNull();
    });

    it("does not report the previous drag on a later bare release", () => {
      const { slider, pressAt } = createSlider({}, 0);
      pressAt(0.3);
      slider.handlePointerUp({ pointerId: 1, currentTarget: null } as unknown as PointerEvent);

      expect(
        slider.handlePointerUp({ pointerId: 1, currentTarget: null } as unknown as PointerEvent),
      ).toBeNull();
    });
  });

  describe("tick marks", () => {
    it("resolves every detent to its own position", () => {
      const { slider } = createSlider({ detents: [0, 25, 100] }, 50);
      expect(slider.tickMarks.value).toEqual([
        { value: 0, ratio: 0 },
        { value: 25, ratio: 0.25 },
        { value: 100, ratio: 1 },
      ]);
    });

    it("spaces geometric detents evenly on a logarithmic track", () => {
      // 850 / 2100 / 5100 is the rebalanced Blitz ladder: near-constant ratios,
      // which a log track must render as near-constant visual gaps.
      const { slider } = createSlider(
        { min: 850, max: 6000, scale: "log", detents: [850, 2100, 5100] },
        850,
      );
      const [first, second, third] = slider.tickMarks.value;
      const firstGap = second.ratio - first.ratio;
      const secondGap = third.ratio - second.ratio;
      expect(Math.abs(firstGap - secondGap)).toBeLessThan(0.05);
    });
  });
});
