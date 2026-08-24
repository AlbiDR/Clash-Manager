// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
import { useBenchmarkedStat } from "../useBenchmarkedStat";
import { ref } from "vue";

// Mock useBenchmarking
const mockGetSafeBenchmark = vi.fn();
vi.mock("@core/services/useBenchmarking", () => ({
  useBenchmarking: () => ({
    getSafeBenchmark: mockGetSafeBenchmark
  })
}));

describe("useBenchmarkedStat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when loading is true", () => {
    const { benchmarkTooltipContent } = useBenchmarkedStat("lb", "score", 500, true);
    expect(benchmarkTooltipContent.value).toBeNull();
    expect(mockGetSafeBenchmark).not.toHaveBeenCalled();
  });

  it("returns null when context is missing", () => {
    const { benchmarkTooltipContent } = useBenchmarkedStat(undefined, "score", 500);
    expect(benchmarkTooltipContent.value).toBeNull();
    expect(mockGetSafeBenchmark).not.toHaveBeenCalled();
  });

  it("returns null when metric is missing", () => {
    const { benchmarkTooltipContent } = useBenchmarkedStat("lb", undefined, 500);
    expect(benchmarkTooltipContent.value).toBeNull();
    expect(mockGetSafeBenchmark).not.toHaveBeenCalled();
  });

  it("calls getSafeBenchmark when all parameters are provided", () => {
    mockGetSafeBenchmark.mockReturnValue("Mock Benchmark Result");
    const { benchmarkTooltipContent } = useBenchmarkedStat("lb", "score", 500);

    expect(benchmarkTooltipContent.value).toBe("Mock Benchmark Result");
    expect(mockGetSafeBenchmark).toHaveBeenCalledWith("lb", "score", 500);
  });

  it("reacts to value changes", () => {
    const value = ref(100);
    const { benchmarkTooltipContent } = useBenchmarkedStat("lb", "score", value);

    expect(benchmarkTooltipContent.value); // Trigger evaluation
    expect(mockGetSafeBenchmark).toHaveBeenCalledWith("lb", "score", 100);

    value.value = 200;
    expect(benchmarkTooltipContent.value); // Trigger evaluation
    expect(mockGetSafeBenchmark).toHaveBeenCalledWith("lb", "score", 200);
  });

  it("reacts to context changes", () => {
    const context = ref<"lb" | "hh">("lb");
    const { benchmarkTooltipContent } = useBenchmarkedStat(context, "score", 500);

    expect(benchmarkTooltipContent.value);
    expect(mockGetSafeBenchmark).toHaveBeenCalledWith("lb", "score", 500);

    context.value = "hh";
    expect(benchmarkTooltipContent.value); // Trigger evaluation
    expect(mockGetSafeBenchmark).toHaveBeenCalledWith("hh", "score", 500);
  });

  it("reacts to loading changes", () => {
    const loading = ref(false);
    const { benchmarkTooltipContent } = useBenchmarkedStat("lb", "score", 500, loading);

    expect(benchmarkTooltipContent.value).not.toBeNull();

    loading.value = true;
    expect(benchmarkTooltipContent.value).toBeNull();
  });
});
