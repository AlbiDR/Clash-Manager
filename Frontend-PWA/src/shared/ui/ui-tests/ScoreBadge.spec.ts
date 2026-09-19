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
            // Named, and rendering both values it declares. The previous stub
            // declared scoreDelta and performanceRawScore and rendered an empty
            // div, so nothing in this file could observe either one. Severing
            // :performance-raw-score at ScoreBadge.vue:43 left all 8 tests
            // passing.
            name: 'MomentumPill',
            template: '<div class="mock-momentum-pill" :data-delta="scoreDelta" :data-raw="performanceRawScore"></div>',
            props: ['scoreDelta', 'performanceRawScore']
          }
        },
        directives: {
          tooltip: vTooltip
        }
      }
    });
  };

  it("hands the momentum pill both of the values it is given", () => {
    // Asserted through the component, not the DOM, so it holds regardless of
    // what the stub chooses to render. performanceRawScore in particular had
    // no assertion anywhere: it could be severed at source without any test
    // noticing.
    const wrapper = createWrapper({ score: 150, scoreDelta: -12, performanceRawScore: 0.42 });
    const pill = wrapper.findComponent({ name: "MomentumPill" });
    expect(pill.exists()).toBe(true);
    expect(pill.props("scoreDelta")).toBe(-12);
    expect(pill.props("performanceRawScore")).toBe(0.42);
  });

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

  it("renders MomentumPill when context is 'lb' and scoreDelta is provided", () => {
    const wrapper = createWrapper({ context: "lb", scoreDelta: 5 });
    expect(wrapper.find(".mock-momentum-pill").exists()).toBe(true);
  });

  it("does NOT render MomentumPill when context is 'hh'", () => {
    const wrapper = createWrapper({ context: "hh", scoreDelta: 5 });
    expect(wrapper.find(".mock-momentum-pill").exists()).toBe(false);
  });

  it("does NOT render MomentumPill when scoreDelta is missing", () => {
    const wrapper = createWrapper({ context: "lb", scoreDelta: undefined });
    expect(wrapper.find(".mock-momentum-pill").exists()).toBe(false);
  });
});
