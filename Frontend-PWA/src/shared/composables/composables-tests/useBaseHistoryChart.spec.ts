// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment node
 *
 * No DOM in this file, so it skips jsdom entirely. Building a jsdom Window
 * costs ~410ms per test file and dominated the suite (80.6s of ~120s CPU,
 * against 8.1s of actual test execution). Adding anything here that touches
 * `document`, `window`, `localStorage` or mounts a component will fail loudly
 * and immediately - remove this docblock if that is intentional.
 */
import { describe, it, expect } from "vitest";
import { useBaseHistoryChart } from "../useBaseHistoryChart";
import { ref } from "vue";

describe("useBaseHistoryChart", () => {
  const defaultOptions = {
    data: [
      { id: "1", value: 10, tooltipLabel: "Point 1" },
      { id: "2", value: 50, tooltipLabel: "Point 2" },
      { id: "3", value: 100, tooltipLabel: "Point 3" },
    ],
    projection: null,
    maxScale: 100,
    loading: false,
  };

  it("calculates chartData.bars correctly", () => {
    const { chartData } = useBaseHistoryChart(defaultOptions);
    expect(chartData.value.bars).toHaveLength(3);
    expect(chartData.value.isEmpty).toBe(false);

    // CHART_MIN_HEIGHT is 15%
    expect(chartData.value.bars[0].height).toBe("15%");
    expect(chartData.value.bars[1].height).toBe("50%");
    expect(chartData.value.bars[2].height).toBe("100%");
  });

  it("handles projection correctly", () => {
    const options = {
      ...defaultOptions,
      projection: { value: 90, tooltipLabel: "Projected" },
    };
    const { chartData } = useBaseHistoryChart(options);

    expect(chartData.value.bars).toHaveLength(4);
    expect(chartData.value.bars[3].isProjection).toBe(true);
    expect(chartData.value.projPoint).not.toBeNull();
  });

  it("identifies trend positivity", () => {
    // Upward trend
    const { chartData: posData } = useBaseHistoryChart(defaultOptions);
    expect(posData.value.isPositive).toBe(true);
    expect(posData.value.path).not.toBeNull();

    // Downward trend
    const negOptions = {
      ...defaultOptions,
      data: [
        { id: "1", value: 100, tooltipLabel: "Point 1" },
        { id: "2", value: 50, tooltipLabel: "Point 2" },
        { id: "3", value: 10, tooltipLabel: "Point 3" },
      ],
    };
    const { chartData: negData } = useBaseHistoryChart(negOptions);
    expect(negData.value.isPositive).toBe(false);
  });

  it("returns empty state when loading", () => {
    const { chartData } = useBaseHistoryChart({ ...defaultOptions, loading: true });
    expect(chartData.value.isEmpty).toBe(true);
    expect(chartData.value.bars).toHaveLength(0);
  });

  it("returns empty state when data is empty", () => {
    const { chartData } = useBaseHistoryChart({ ...defaultOptions, data: [] });
    expect(chartData.value.isEmpty).toBe(true);
    expect(chartData.value.bars).toHaveLength(0);
  });

  it("reacts to options changes", () => {
    const data = ref(defaultOptions.data);
    const { chartData } = useBaseHistoryChart({ ...defaultOptions, data });

    expect(chartData.value.bars).toHaveLength(3);

    data.value = [...data.value, { id: "4", value: 20, tooltipLabel: "Point 4" }];
    expect(chartData.value.bars).toHaveLength(4);
  });
});
