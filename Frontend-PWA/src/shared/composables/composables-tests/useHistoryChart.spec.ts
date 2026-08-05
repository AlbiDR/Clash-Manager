// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import { useHistoryChart } from "../useHistoryChart";
import { ref } from "vue";

describe("useHistoryChart", () => {
  it("returns empty state when loading is true", () => {
    const history = ref("3600 2024-W12");
    const { mappedData } = useHistoryChart(history, "war", true);

    expect(mappedData.value).toEqual({
      data: [],
      projection: null,
      maxScale: 0
    });
  });

  it("handles empty or undefined history gracefully", () => {
    const history = ref(undefined);
    const { mappedData } = useHistoryChart(history, "war");

    expect(mappedData.value.data).toEqual([]);
    expect(mappedData.value.projection).toBeNull();
    expect(mappedData.value.maxScale).toBe(3600);

    history.value = "-";
    expect(mappedData.value.data).toEqual([]);
  });

  it("processes 'war' type data with correct units and constants", () => {
    const history = ref("3600 2024-W12|2400 2024-W11");
    const { mappedData } = useHistoryChart(history, "war");

    expect(mappedData.value.maxScale).toBe(3600);
    // Chronological reversal: 2024-W11 should come before 2024-W12
    expect(mappedData.value.data[0].value).toBe(2400);
    expect(mappedData.value.data[1].value).toBe(3600);

    expect(mappedData.value.data[0].tooltipLabel).toContain("Fame");
    expect(mappedData.value.projection?.tooltipLabel).toContain("Fame");
    expect(mappedData.value.projection?.tooltipLabel).toContain("Projected");
  });

  it("processes 'voyage' type data with correct units and constants", () => {
    const history = ref("250 2024-05-01|150 2024-04-20");
    const { mappedData } = useHistoryChart(history, "voyage");

    expect(mappedData.value.maxScale).toBe(250);
    expect(mappedData.value.data[0].value).toBe(150);
    expect(mappedData.value.data[1].value).toBe(250);

    expect(mappedData.value.data[0].tooltipLabel).toContain("Crowns");
    expect(mappedData.value.projection?.tooltipLabel).toContain("Crowns");
    expect(mappedData.value.projection?.tooltipLabel).toContain("Projected");
  });

  it("limits history entries based on type", () => {
    // War limit is 52, Voyage limit is 15.
    const longHistory = Array.from({ length: 20 }, (_, i) => `${100 + i} 2024-W${20 - i}`).join("|");
    const { mappedData } = useHistoryChart(ref(longHistory), "voyage");

    // It slices(0, 15) then reverses.
    expect(mappedData.value.data.length).toBe(15);
  });

  it("updates mappedData when history ref changes", () => {
    const history = ref("1000 2024-W01");
    const { mappedData } = useHistoryChart(history, "war");

    expect(mappedData.value.data[0].value).toBe(1000);

    history.value = "2000 2024-W02";
    expect(mappedData.value.data[0].value).toBe(2000);
  });

  it("generates correct tooltip labels for dates vs weeks", () => {
    const history = ref("100 2024-05-15|200 2024-W10");
    const { mappedData } = useHistoryChart(history, "war");

    // Reversed: Week 10 (200), then 05/15 (100)
    expect(mappedData.value.data[0].tooltipLabel).toContain("Week 10");
    expect(mappedData.value.data[1].tooltipLabel).toContain("05/15");
  });

  it("calculates projection based on history data", () => {
    // With 3600 for two weeks, prediction should be 3600
    const history = ref("3600 2024-W12|3600 2024-W11");
    const { mappedData } = useHistoryChart(history, "war");

    expect(mappedData.value.projection?.value).toBe(3600);
  });
});
