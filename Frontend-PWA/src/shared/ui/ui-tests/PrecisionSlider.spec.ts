// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import PrecisionSlider from "../PrecisionSlider.vue";

/** Width used for the stubbed track. */
const TRACK_WIDTH = 200;
/** Left offset of the stubbed track. */
const TRACK_LEFT = 0;

const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

describe("PrecisionSlider", () => {
  beforeEach(() => {
    // jsdom reports a zero-sized rect for every element, which would make every
    // pointer gesture a silent no-op rather than a measurable one.
    Element.prototype.getBoundingClientRect = function stubbedRect() {
      return { left: TRACK_LEFT, width: TRACK_WIDTH } as DOMRect;
    };
  });

  afterEach(() => {
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });

  /**
   * Mounts the slider over a linear 0..100 domain by default.
   *
   * @param props - Props to apply over the defaults.
   * @returns The mounted wrapper.
   */
  function mountSlider(props: Record<string, unknown> = {}) {
    return mount(PrecisionSlider, {
      props: {
        modelValue: 50,
        label: "Threshold",
        min: 0,
        max: 100,
        step: 1,
        scale: "linear",
        ...props,
      },
    });
  }

  /**
   * Dispatches a pointer event carrying real coordinates.
   *
   * @remarks
   * `clientX` is getter-only on a jsdom MouseEvent, so Test Utils cannot set it
   * through `trigger`.
   *
   * @param element - The element to dispatch on.
   * @param type - The pointer event type.
   * @param clientX - The horizontal viewport coordinate.
   */
  function firePointer(element: Element, type: string, clientX: number): void {
    const pointerEvent = new MouseEvent(type, { bubbles: true, cancelable: true });
    Object.defineProperty(pointerEvent, "clientX", { value: clientX });
    Object.defineProperty(pointerEvent, "pointerId", { value: 1 });
    element.dispatchEvent(pointerEvent);
  }

  describe("presentation", () => {
    it("renders the label, the value and the unit", () => {
      const wrapper = mountSlider({ modelValue: 2100, min: 850, max: 6000, unit: "MS" });

      expect(wrapper.find(".ps-label").text()).toBe("Threshold");
      expect(wrapper.find(".ps-readout-digits").text()).toBe("2100");
      expect(wrapper.find(".ps-readout-unit").text()).toBe("MS");
    });

    it("omits the unit element when no unit is given", () => {
      expect(mountSlider().find(".ps-readout-unit").exists()).toBe(false);
    });

    it("reserves the readout width from the widest value the domain can produce", () => {
      // [THREAT:] A readout that resizes as digits change nudges the label beside
      // it on every drag, so the whole row twitches while the handle moves.
      const wide = mountSlider({ min: 1, max: 9999, modelValue: 5 });
      const narrow = mountSlider({ min: 0, max: 9, modelValue: 5 });

      expect(wide.find(".ps-readout-digits").attributes("style")).toContain("width: 4ch");
      expect(narrow.find(".ps-readout-digits").attributes("style")).toContain("width: 1ch");
    });

    it("applies a custom value formatter to both the readout and the reservation", () => {
      const wrapper = mountSlider({
        modelValue: 50,
        formatValue: (sliderValue: number) => `${sliderValue.toFixed(1)}x`,
      });

      expect(wrapper.find(".ps-readout-digits").text()).toBe("50.0x");
      expect(wrapper.find(".ps-readout-digits").attributes("style")).toContain("width: 6ch");
    });

    it("publishes the handle position as a custom property", () => {
      const style = mountSlider({ modelValue: 25 }).attributes("style");

      expect(style).toContain("--ps-ratio: 0.25");
      expect(style).toContain("--ps-thumb: 18px");
    });

    it("shrinks the handle in the compact density", () => {
      const style = mountSlider({ density: "compact" }).attributes("style");

      expect(style).toContain("--ps-thumb: 14px");
    });

    it("renders the consequence and its qualifier only when supplied", () => {
      const bare = mountSlider();
      const annotated = mountSlider({
        consequence: "a full run takes about 2m",
        consequenceChip: "43 members",
      });

      expect(bare.find(".ps-consequence").exists()).toBe(false);
      expect(annotated.find(".ps-consequence").text()).toContain("a full run takes about 2m");
      expect(annotated.find(".ps-chip").text()).toBe("43 members");
    });

    it("renders the domain bounds only when asked", () => {
      const bare = mountSlider({ min: 850, max: 6000, detents: [1500, 3000] });
      const bounded = mountSlider({
        min: 850, max: 6000, detents: [1500, 3000], showBounds: true,
      });

      expect(bare.find(".ps-scale").exists()).toBe(false);
      expect(bounded.findAll(".ps-scale span").map((s) => s.text())).toEqual(["850", "6000"]);
    });

    it("places each bound through the same offset expression as the handle", () => {
      // [THREAT:] A distributed row spaces labels evenly, which only matches the
      // ticks on a linear scale. On a logarithmic track it puts a label tens of
      // pixels from the value it names.
      const bounds = mountSlider({ min: 850, max: 6000, showBounds: true })
        .findAll(".ps-scale span");

      expect(bounds[0].attributes("style")).toContain(
        "calc(var(--ps-thumb) / 2 + 0 * (100% - var(--ps-thumb)))",
      );
      expect(bounds[1].attributes("style")).toContain(
        "calc(var(--ps-thumb) / 2 + 1 * (100% - var(--ps-thumb)))",
      );
    });
  });

  describe("tick marks", () => {
    it("draws interior detents and leaves the domain bounds to the track ends", () => {
      const wrapper = mountSlider({ detents: [0, 25, 50, 75, 100] });

      expect(wrapper.findAll(".ps-tick").length).toBe(3);
    });

    it("narrows the drawn set to tickValues when given", () => {
      const wrapper = mountSlider({
        detents: [10, 20, 30, 40, 50, 60, 70, 80, 90],
        tickValues: [30, 60],
      });

      expect(wrapper.findAll(".ps-tick").length).toBe(2);
    });

    it("marks only the detents the fill has passed", () => {
      // The current position is marked by the handle itself. A tick under it is
      // 14px tall beneath an 18px handle and can never be seen, so no state is
      // rendered for it.
      const wrapper = mountSlider({ modelValue: 50, detents: [25, 50, 75] });
      const ticks = wrapper.findAll(".ps-tick");

      expect(ticks[0].attributes("data-passed")).toBe("true");
      expect(ticks[1].attributes("data-passed")).toBeUndefined();
      expect(ticks[2].attributes("data-passed")).toBeUndefined();
      expect(wrapper.find("[data-here]").exists()).toBe(false);
    });

    it("positions every tick through the same inset travel as the handle", () => {
      // Fill, handle and ticks must resolve identically or they drift apart at
      // container widths other than the one they were eyeballed at.
      const wrapper = mountSlider({ detents: [50] });

      expect(wrapper.find(".ps-tick").attributes("style")).toContain(
        "calc(var(--ps-thumb) / 2 + 0.5 * (100% - var(--ps-thumb)))",
      );
    });
  });

  describe("accessibility", () => {
    it("exposes the slider contract", () => {
      const hit = mountSlider({ modelValue: 40, min: 10, max: 90 }).find(".ps-hit");

      expect(hit.attributes("role")).toBe("slider");
      expect(hit.attributes("aria-label")).toBe("Threshold");
      expect(hit.attributes("aria-valuemin")).toBe("10");
      expect(hit.attributes("aria-valuemax")).toBe("90");
      expect(hit.attributes("aria-valuenow")).toBe("40");
      expect(hit.attributes("tabindex")).toBe("0");
    });

    it("speaks the consequence rather than the bare number", () => {
      const hit = mountSlider({
        modelValue: 2100,
        min: 850,
        max: 6000,
        unit: "MS",
        consequence: "a full run takes about 1m 30s",
      }).find(".ps-hit");

      expect(hit.attributes("aria-valuetext")).toBe(
        "2100 MS, a full run takes about 1m 30s",
      );
    });

    it("falls back to the value and unit when no consequence is supplied", () => {
      const hit = mountSlider({ modelValue: 50, unit: "%" }).find(".ps-hit");

      expect(hit.attributes("aria-valuetext")).toBe("50 %");
    });
  });

  describe("interaction", () => {
    it("commits the value under the pointer", async () => {
      const wrapper = mountSlider({ modelValue: 0 });
      const hit = wrapper.find(".ps-hit").element;

      // An 18px handle on a 200px track leaves 182px of travel, offset by 9px.
      firePointer(hit, "pointerdown", 9 + 0.25 * 182);
      await nextTick();

      expect(wrapper.emitted("update:modelValue")!.at(-1)).toEqual([25]);
    });

    it("follows a drag and stops at release", async () => {
      const wrapper = mountSlider({ modelValue: 0 });
      const hit = wrapper.find(".ps-hit").element;

      firePointer(hit, "pointerdown", 9);
      firePointer(hit, "pointermove", 9 + 0.5 * 182);
      firePointer(hit, "pointerup", 9 + 0.5 * 182);
      firePointer(hit, "pointermove", 9 + 182);
      await nextTick();

      expect(wrapper.emitted("update:modelValue")!.at(-1)).toEqual([50]);
    });

    it("walks detents with the arrow keys", async () => {
      const wrapper = mountSlider({ modelValue: 50, detents: [0, 25, 50, 75, 100] });

      await wrapper.find(".ps-hit").trigger("keydown", { key: "ArrowRight" });

      expect(wrapper.emitted("update:modelValue")![0]).toEqual([75]);
    });

    it("jumps to the bounds with Home and End", async () => {
      const wrapper = mountSlider({ modelValue: 50 });
      const hit = wrapper.find(".ps-hit");

      await hit.trigger("keydown", { key: "End" });
      expect(wrapper.emitted("update:modelValue")!.at(-1)).toEqual([100]);
    });
  });

  describe("disabled", () => {
    it("mutes the control and removes it from the tab order", () => {
      const wrapper = mountSlider({ disabled: true });

      expect(wrapper.find(".ps-hit").classes()).toContain("is-disabled");
      expect(wrapper.find(".ps-hit").attributes("tabindex")).toBe("-1");
      expect(wrapper.find(".ps-hit").attributes("aria-disabled")).toBe("true");
    });

    it("commits nothing from a pointer or a key", async () => {
      const wrapper = mountSlider({ disabled: true, detents: [0, 50, 100] });
      const hit = wrapper.find(".ps-hit");

      firePointer(hit.element, "pointerdown", 100);
      await hit.trigger("keydown", { key: "ArrowRight" });
      await nextTick();

      expect(wrapper.emitted("update:modelValue")).toBeFalsy();
    });
  });
});
