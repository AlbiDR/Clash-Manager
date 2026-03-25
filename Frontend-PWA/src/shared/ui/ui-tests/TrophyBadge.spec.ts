// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import TrophyBadge from "../TrophyBadge.vue";

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

describe("TrophyBadge.vue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSafeBenchmark.mockReturnValue("Mocked Benchmark Tooltip");
  });

  const createWrapper = (props = {}) => {
    return mount(TrophyBadge, {
      props: {
        value: 5000,
        context: "lb" as const,
        ...props
      },
      global: {
        stubs: {
          Icon: {
            template: '<span class="mock-icon" :name="name"></span>',
            props: ['name']
          }
        },
        directives: {
          tooltip: vTooltip
        }
      }
    });
  };

  it("renders correctly with a valid trophy count", () => {
    const wrapper = createWrapper({ value: 5250 });

    // Check rendered value - toLocaleString() usually adds commas in default test env
    expect(wrapper.find(".trophy-val").text()).toContain("5,250");
    expect(wrapper.find(".mock-icon").attributes("name")).toBe("trophy");
  });

  it("renders '0' when value is undefined", () => {
    const wrapper = createWrapper({ value: undefined });
    expect(wrapper.find(".trophy-val").text()).toBe("0");
  });

  it("passes correct context and value to getSafeBenchmark", () => {
    createWrapper({ value: 6000, context: "hh" });
    expect(mockGetSafeBenchmark).toHaveBeenCalledWith("hh", "trophies", 6000);
  });

  it("binds the tooltip directive to the benchmark value", () => {
    createWrapper();
    expect(vTooltip.mounted).toHaveBeenCalled();
    const call = vTooltip.mounted.mock.calls[0];
    expect(call[1].value).toBe("Mocked Benchmark Tooltip");
  });
});
