// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import BaseHistoryChart from "../BaseHistoryChart.vue";
import { useGhostBenchmarkState } from "../../directives/ghostBenchmarkState";

describe("BaseHistoryChart.vue", () => {
  const defaultProps = {
    historySeries: [
      { id: "1", value: 10, tooltipLabel: "Point 1" },
      { id: "2", value: 50, tooltipLabel: "Point 2" },
      { id: "3", value: 100, tooltipLabel: "Point 3" },
    ],
    projection: null,
    theme: "war" as const,
    maxScale: 100,
  };

  // Mock v-tooltip directive
  const global = {
    directives: {
      tooltip: () => {},
    },
  };

  it("renders the correct number of bars", () => {
    const wrapper = mount(BaseHistoryChart, {
      props: defaultProps,
      global,
    });
    expect(wrapper.findAll(".bar")).toHaveLength(3);
  });

  it("calculates bar heights correctly and respects CHART_MIN_HEIGHT", () => {
    const wrapper = mount(BaseHistoryChart, {
      props: {
        ...defaultProps,
        historySeries: [
          { id: "min", value: 0, tooltipLabel: "Min" },
          { id: "mid", value: 50, tooltipLabel: "Mid" },
          { id: "max", value: 100, tooltipLabel: "Max" },
        ],
      },
      global,
    });

    const bars = wrapper.findAll(".bar");
    // CHART_MIN_HEIGHT is 15%
    expect(bars[0].attributes("style")).toContain("height: 15%");
    expect(bars[1].attributes("style")).toContain("height: 50%");
    expect(bars[2].attributes("style")).toContain("height: 100%");
  });

  it("applies theme classes correctly", () => {
    const warWrapper = mount(BaseHistoryChart, {
      props: { ...defaultProps, theme: "war" },
      global,
    });
    expect(warWrapper.find(".base-chart").classes()).toContain("theme-war");

    const voyageWrapper = mount(BaseHistoryChart, {
      props: { ...defaultProps, theme: "voyage" },
      global,
    });
    expect(voyageWrapper.find(".base-chart").classes()).toContain("theme-voyage");
  });

  it("generates a trend line path and correctly identifies positivity", () => {
    // Upward trend
    const posWrapper = mount(BaseHistoryChart, {
      props: defaultProps,
      global,
    });
    const posPath = posWrapper.find(".trend-path");
    expect(posPath.exists()).toBe(true);
    expect(posPath.classes()).toContain("positive");

    // Downward trend
    const negWrapper = mount(BaseHistoryChart, {
      props: {
        ...defaultProps,
        historySeries: [
          { id: "1", value: 100, tooltipLabel: "Point 1" },
          { id: "2", value: 50, tooltipLabel: "Point 2" },
          { id: "3", value: 10, tooltipLabel: "Point 3" },
        ],
      },
      global,
    });
    const negPath = negWrapper.find(".trend-path");
    expect(negPath.classes()).toContain("negative");
  });

  it("assigns win/hit/miss classes based on winThreshold", () => {
    const wrapper = mount(BaseHistoryChart, {
      props: {
        ...defaultProps,
        historySeries: [
          { id: "miss", value: 0, tooltipLabel: "Miss" },
          { id: "hit", value: 40, tooltipLabel: "Hit" },
          { id: "win", value: 80, tooltipLabel: "Win" },
        ],
        winThreshold: 75,
      },
      global,
    });

    const bars = wrapper.findAll(".bar");
    expect(bars[0].classes()).toContain("bar-miss");
    expect(bars[1].classes()).toContain("bar-hit");
    expect(bars[2].classes()).toContain("bar-win");
  });

  it("renders projection bar and dot when provided", () => {
    const wrapper = mount(BaseHistoryChart, {
      props: {
        ...defaultProps,
        projection: { value: 90, tooltipLabel: "Projected" },
      },
      global,
    });

    // 3 actual bars + 1 projection bar
    expect(wrapper.findAll(".bar")).toHaveLength(4);
    expect(wrapper.find(".bar-projected").exists()).toBe(true);
    expect(wrapper.find(".chart-dot.projected").exists()).toBe(true);
  });

  it("renders loading state with skeleton bars", () => {
    const wrapper = mount(BaseHistoryChart, {
      props: {
        ...defaultProps,
        loading: true,
      },
      global,
    });

    expect(wrapper.find(".skeleton-anim").exists()).toBe(true);
    expect(wrapper.findAll(".sk-chart-bar")).toHaveLength(10);
    expect(wrapper.find(".base-chart").exists()).toBe(false);
  });

  it("renders empty state when data is empty", () => {
    const wrapper = mount(BaseHistoryChart, {
      props: {
        ...defaultProps,
        historySeries: [],
      },
      global,
    });

    expect(wrapper.text()).toContain("No history");
    expect(wrapper.find(".base-chart").exists()).toBe(false);
  });

  describe("touch selection", () => {
    const BAR_PITCH = 10;
    const BAR_WIDTH = 8;

    function stubPointer(coarse: boolean) {
      vi.stubGlobal(
        "matchMedia",
        vi.fn().mockReturnValue({
          matches: coarse,
          media: "(pointer: coarse)",
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }),
      );
    }

    /** jsdom has no layout, so place the bars on a fixed 10px pitch. */
    function mountChart(coarse: boolean) {
      stubPointer(coarse);
      const wrapper = mount(BaseHistoryChart, { props: defaultProps, global });
      wrapper.findAll(".bar").forEach((bar, barIndex) => {
        bar.element.getBoundingClientRect = () =>
          ({ left: barIndex * BAR_PITCH, width: BAR_WIDTH, right: barIndex * BAR_PITCH + BAR_WIDTH }) as DOMRect;
      });
      return wrapper;
    }

    /** Centre of a bar on the stubbed layout. */
    const centerOf = (barIndex: number) => barIndex * BAR_PITCH + BAR_WIDTH / 2;

    /**
     * jsdom has no PointerEvent and Vue Test Utils cannot set coordinates on the
     * MouseEvent it falls back to, so build the event here. The component reads
     * only `clientX` and the event type.
     */
    const chartOf = (wrapper: VueWrapper) => {
      const chartEl = wrapper.find(".base-chart");
      return {
        classes: () => chartEl.classes(),
        trigger: async (type: string, init: { clientX?: number } = {}) => {
          chartEl.element.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: init.clientX ?? 0 }));
          await nextTick();
        },
      };
    };
    const highlighted = (wrapper: VueWrapper) =>
      wrapper.findAll(".bar").flatMap((bar, barIndex) => (bar.classes("is-active") ? [barIndex] : []));

    beforeEach(() => {
      useGhostBenchmarkState().hide();
    });

    afterEach(() => {
      useGhostBenchmarkState().hide();
      vi.unstubAllGlobals();
    });

    it("opens the sheet on the bar nearest the finger, even between two bars", async () => {
      const wrapper = mountChart(true);
      const { active } = useGhostBenchmarkState();

      // 4px past the first bar's edge: nearer to bar 1 than to bar 0 or 2.
      await chartOf(wrapper).trigger("pointerdown", { clientX: centerOf(1) + 3 });
      await chartOf(wrapper).trigger("pointerup");

      expect(active.value?.content).toBe("Point 2");
      expect(active.value?.stepper).toMatchObject({ position: 2, total: 3 });
      expect(highlighted(wrapper)).toEqual([1]);
      expect(chartOf(wrapper).classes()).toContain("has-active");
    });

    it("follows a drag along the chart and opens only where the finger lifts", async () => {
      const wrapper = mountChart(true);
      const { active } = useGhostBenchmarkState();

      await chartOf(wrapper).trigger("pointerdown", { clientX: centerOf(0) });
      await chartOf(wrapper).trigger("pointermove", { clientX: centerOf(1) });
      expect(highlighted(wrapper)).toEqual([1]);
      expect(active.value).toBeNull();

      await chartOf(wrapper).trigger("pointermove", { clientX: centerOf(2) });
      await chartOf(wrapper).trigger("pointerup");

      expect(highlighted(wrapper)).toEqual([2]);
      expect(active.value?.content).toBe("Point 3");
    });

    it("tells the sheet to ignore the click that finishes the opening tap", async () => {
      const wrapper = mountChart(true);
      const { ignoreBackdropClick } = useGhostBenchmarkState();
      ignoreBackdropClick.value = false;

      await chartOf(wrapper).trigger("pointerdown", { clientX: centerOf(1) });
      expect(ignoreBackdropClick.value).toBe(false);
      await chartOf(wrapper).trigger("pointerup");

      expect(ignoreBackdropClick.value).toBe(true);
    });

    it("steps the selection and the sheet together with the arrows", async () => {
      const wrapper = mountChart(true);
      const { active } = useGhostBenchmarkState();

      await chartOf(wrapper).trigger("pointerdown", { clientX: centerOf(1) });
      await chartOf(wrapper).trigger("pointerup");

      active.value?.stepper?.go(-1);
      await nextTick();
      expect(active.value?.content).toBe("Point 1");
      expect(active.value?.stepper?.position).toBe(1);
      expect(highlighted(wrapper)).toEqual([0]);

      active.value?.stepper?.go(1);
      await nextTick();
      expect(active.value?.content).toBe("Point 2");
      expect(highlighted(wrapper)).toEqual([1]);
    });

    it("does not step past either end", async () => {
      const wrapper = mountChart(true);
      const { active } = useGhostBenchmarkState();

      await chartOf(wrapper).trigger("pointerdown", { clientX: centerOf(0) });
      await chartOf(wrapper).trigger("pointerup");
      active.value?.stepper?.go(-1);
      await nextTick();
      expect(active.value?.stepper?.position).toBe(1);

      await chartOf(wrapper).trigger("pointerdown", { clientX: centerOf(2) });
      await chartOf(wrapper).trigger("pointerup");
      active.value?.stepper?.go(1);
      await nextTick();
      expect(active.value?.stepper?.position).toBe(3);
    });

    it("clears the highlight when the sheet is dismissed", async () => {
      const wrapper = mountChart(true);

      await chartOf(wrapper).trigger("pointerdown", { clientX: centerOf(1) });
      await chartOf(wrapper).trigger("pointerup");
      expect(highlighted(wrapper)).toEqual([1]);

      useGhostBenchmarkState().hide();
      await nextTick();

      expect(highlighted(wrapper)).toEqual([]);
      expect(chartOf(wrapper).classes()).not.toContain("has-active");
    });

    it("drops the pick without opening when the browser takes the gesture for scrolling", async () => {
      const wrapper = mountChart(true);
      const { active } = useGhostBenchmarkState();

      await chartOf(wrapper).trigger("pointerdown", { clientX: centerOf(1) });
      expect(highlighted(wrapper)).toEqual([1]);
      await chartOf(wrapper).trigger("pointercancel");

      expect(highlighted(wrapper)).toEqual([]);
      expect(active.value).toBeNull();
    });

    it("leaves fine pointers to the hover popover", async () => {
      const wrapper = mountChart(false);
      const { active } = useGhostBenchmarkState();

      await chartOf(wrapper).trigger("pointerdown", { clientX: centerOf(1) });
      await chartOf(wrapper).trigger("pointerup");

      expect(active.value).toBeNull();
      expect(highlighted(wrapper)).toEqual([]);
    });
  });
});
