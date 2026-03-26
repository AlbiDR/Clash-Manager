// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import ScoreBadge from "../ScoreBadge.vue";

// Mock dependencies
const { mockGetSafeBenchmark } = vi.hoisted(() => ({
  mockGetSafeBenchmark: vi.fn()
}));

vi.mock("@core/services/useBenchmarking", () => ({
  useBenchmarking: () => ({
    getSafeBenchmark: mockGetSafeBenchmark
  })
}));

// Mock directive
const vTooltip = {
  mounted: vi.fn(),
  updated: vi.fn()
};

describe("ScoreBadge.vue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSafeBenchmark.mockReturnValue("Mocked Benchmark Tooltip");
  });

  const createWrapper = (props = {}) => {
    return mount(ScoreBadge, {
      props: {
        score: 100,
        context: "lb" as const,
        ...props
      },
      global: {
        stubs: {
          MomentumPill: {
            template: '<div class="mock-momentum-pill"></div>',
            props: ['dt', 'performanceRawScore']
          }
        },
        directives: {
          tooltip: vTooltip
        }
      }
    });
  };

  it("renders correctly with a valid score", () => {
    const wrapper = createWrapper({ score: 150 });
    expect(wrapper.find(".stat-score").text()).toBe("150");
  });

  it("rounds float scores correctly", () => {
    const wrapper = createWrapper({ score: 125.6 });
    expect(wrapper.find(".stat-score").text()).toBe("126");

    const wrapper2 = createWrapper({ score: 125.4 });
    expect(wrapper2.find(".stat-score").text()).toBe("125");
  });

  it("renders '0' when score is undefined", () => {
    const wrapper = createWrapper({ score: undefined });
    expect(wrapper.find(".stat-score").text()).toBe("0");
  });

  it("passes correct context and score to getSafeBenchmark", () => {
    createWrapper({ score: 200, context: "hh" });
    expect(mockGetSafeBenchmark).toHaveBeenCalledWith("hh", "score", 200);
  });

  it("binds the tooltip directive to the benchmark value", () => {
    mockGetSafeBenchmark.mockReturnValue("Expected Tooltip Text");
    createWrapper();

    expect(vTooltip.mounted).toHaveBeenCalled();
    const call = vTooltip.mounted.mock.calls[0];
    expect(call[1].value).toBe("Expected Tooltip Text");
  });

  it("renders MomentumPill when context is 'lb' and dt is provided", () => {
    const wrapper = createWrapper({ context: "lb", dt: 5 });
    expect(wrapper.find(".mock-momentum-pill").exists()).toBe(true);
  });

  it("does NOT render MomentumPill when context is 'hh'", () => {
    const wrapper = createWrapper({ context: "hh", dt: 5 });
    expect(wrapper.find(".mock-momentum-pill").exists()).toBe(false);
  });

  it("does NOT render MomentumPill when dt is missing", () => {
    const wrapper = createWrapper({ context: "lb", dt: undefined });
    expect(wrapper.find(".mock-momentum-pill").exists()).toBe(false);
  });
});
