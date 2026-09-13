// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import ScoreThresholdSelector from "../ScoreThresholdSelector.vue";

const { mockTap, mockMedium } = vi.hoisted(() => ({
  mockTap: vi.fn(),
  mockMedium: vi.fn(),
}));

vi.mock("@shared/composables/useHaptics", () => ({
  useHaptics: () => ({
    tap: mockTap,
    medium: mockMedium,
    heavy: vi.fn(),
  }),
}));

/** Width used for the stubbed track, so client coordinates map to clean values. */
const TRACK_WIDTH = 200;
/** Left offset of the stubbed track. */
const TRACK_LEFT = 0;

const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

describe("ScoreThresholdSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();

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
   * Mounts the selector with the given model state.
   *
   * @param props - Props and model values to mount with.
   * @returns The mounted wrapper.
   */
  function mountSelector(props: Record<string, unknown> = {}) {
    return mount(ScoreThresholdSelector, {
      props: { mode: "ge", value: 75, ...props },
    });
  }

  /**
   * Dispatches a pointer event carrying real coordinates.
   *
   * @remarks
   * `clientX` is getter-only on a jsdom MouseEvent, so Test Utils cannot set it
   * through `trigger`. Constructing the event and defining the property is the
   * only way to give the handler a coordinate to measure.
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

  /**
   * Drives a full press, move and release across the track.
   *
   * @param wrapper - The mounted wrapper.
   * @param position - A 0..1 position to release at.
   */
  async function dragTo(wrapper: ReturnType<typeof mountSelector>, position: number) {
    const slider = wrapper.find(".sp-slider").element;
    const clientX = TRACK_LEFT + position * TRACK_WIDTH;
    firePointer(slider, "pointerdown", clientX);
    firePointer(slider, "pointermove", clientX);
    firePointer(slider, "pointerup", clientX);
    await nextTick();
  }

  it("renders the comparison symbol and the current threshold", () => {
    const wrapper = mountSelector();

    expect(wrapper.find(".mode-symbol").text()).toBe("≥");
    expect(wrapper.find(".sp-label").text()).toBe("75");
  });

  it("displays the correct symbol for le mode", () => {
    const wrapper = mountSelector({ mode: "le", value: 45 });

    expect(wrapper.find(".mode-symbol").text()).toBe("≤");
    expect(wrapper.find(".sp-label").text()).toBe("45");
  });

  it("toggles mode and republishes the selection", async () => {
    const wrapper = mountSelector();

    await wrapper.find(".mode-toggle").trigger("click");

    expect(wrapper.emitted("update:mode")![0]).toEqual(["le"]);
    expect(wrapper.emitted("select")![0]).toEqual([75, "le"]);
  });

  it("commits the dragged value and publishes once on release", async () => {
    const wrapper = mountSelector();

    await dragTo(wrapper, 0.4);

    // The value follows the finger, so several updates are expected.
    const valueUpdates = wrapper.emitted("update:value")!;
    expect(valueUpdates.at(-1)).toEqual([40]);

    // [THREAT:] `select` rebuilds the batch selection downstream. Emitting it per
    // pointer move would churn the selection for the length of a drag.
    expect(wrapper.emitted("select")!.length).toBe(1);
    expect(wrapper.emitted("select")![0]).toEqual([40, "ge"]);
  });

  it("does not publish a selection for a release that never dragged", async () => {
    const wrapper = mountSelector();

    firePointer(wrapper.find(".sp-slider").element, "pointerup", 100);
    await nextTick();

    expect(wrapper.emitted("select")).toBeFalsy();
  });

  it("snaps a drag onto the five-point grid", async () => {
    const wrapper = mountSelector();

    // 0.43 along the track is a raw 43, which sits between the 40 and 45 stops.
    // Both the magnetic pull and the step grid resolve it to 45, because for this
    // consumer they are deliberately the same 5-point interval.
    await dragTo(wrapper, 0.43);

    expect(wrapper.emitted("select")![0]).toEqual([45, "ge"]);
  });

  it("walks the five-point grid with the arrow keys", async () => {
    const wrapper = mountSelector();
    const slider = wrapper.find(".sp-slider");

    await slider.trigger("keydown", { key: "ArrowRight" });

    expect(wrapper.emitted("update:value")![0]).toEqual([80]);
    expect(wrapper.emitted("select")![0]).toEqual([80, "ge"]);
  });

  it("does not republish when a key changes nothing", async () => {
    const wrapper = mountSelector({ value: 100 });

    await wrapper.find(".sp-slider").trigger("keydown", { key: "ArrowRight" });

    expect(wrapper.emitted("select")).toBeFalsy();
  });

  it("anchors the fill to the side the filter keeps", async () => {
    const greaterOrEqual = mountSelector({ mode: "ge", value: 75 });
    const lessOrEqual = mountSelector({ mode: "le", value: 75 });

    expect(greaterOrEqual.find(".score-pill-group").attributes("data-mode")).toBe("ge");
    expect(lessOrEqual.find(".score-pill-group").attributes("data-mode")).toBe("le");
  });

  it("draws quartile ticks rather than all twenty-one detents", () => {
    const wrapper = mountSelector();

    // 25, 50 and 75. The domain bounds are the track's own ends and carry no tick.
    expect(wrapper.findAll(".sp-tick").length).toBe(3);
  });

  it("exposes the value to assistive technology as a predicate", () => {
    const slider = mountSelector({ mode: "ge", value: 60 }).find(".sp-slider");

    expect(slider.attributes("role")).toBe("slider");
    expect(slider.attributes("aria-valuenow")).toBe("60");
    expect(slider.attributes("aria-valuetext")).toBe("60 or above");
    expect(slider.attributes("aria-valuemin")).toBe("0");
    expect(slider.attributes("aria-valuemax")).toBe("100");
  });

  it("respects the disabled prop", async () => {
    const wrapper = mountSelector({ disabled: true });

    expect(wrapper.find(".score-pill-group").classes()).toContain("disabled");
    expect(wrapper.find(".mode-toggle").attributes()).toHaveProperty("disabled");
    expect(wrapper.find(".sp-slider").attributes("tabindex")).toBe("-1");
    expect(wrapper.find(".sp-slider").attributes("aria-disabled")).toBe("true");

    await wrapper.find(".mode-toggle").trigger("click");
    await dragTo(wrapper, 0.2);
    await wrapper.find(".sp-slider").trigger("keydown", { key: "ArrowLeft" });

    expect(wrapper.emitted("update:mode")).toBeFalsy();
    expect(wrapper.emitted("update:value")).toBeFalsy();
    expect(wrapper.emitted("select")).toBeFalsy();
  });
});
