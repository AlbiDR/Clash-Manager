// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import TenureBadge from "../TenureBadge.vue";

const { mockGetSafeBenchmark } = vi.hoisted(() => ({
  mockGetSafeBenchmark: vi.fn()
}));

vi.mock("@core/services/useBenchmarking", () => ({
  useBenchmarking: () => ({
    getSafeBenchmark: mockGetSafeBenchmark
  })
}));

const vTooltip = {
  mounted: vi.fn(),
  updated: vi.fn()
};

describe("TenureBadge.vue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSafeBenchmark.mockReturnValue(null);
  });

  const createWrapper = (props = {}) => {
    return mount(TenureBadge, {
      props: {
        days: 10,
        ...props
      },
      global: {
        directives: {
          tooltip: vTooltip
        }
      }
    });
  };

  it("renders correctly with a valid number of days", () => {
    const wrapper = createWrapper({ days: 365 });
    expect(wrapper.text()).toBe("365d");
  });

  it("renders '0d' when days is undefined", () => {
    const wrapper = createWrapper({ days: undefined });
    expect(wrapper.text()).toBe("0d");
  });

  it("renders '0d' when days is 0", () => {
    const wrapper = createWrapper({ days: 0 });
    expect(wrapper.text()).toBe("0d");
  });

  it("passes correct context and value to getSafeBenchmark", () => {
    createWrapper({ days: 250, context: "lb" });
    expect(mockGetSafeBenchmark).toHaveBeenCalledWith("lb", "tenure", 250);
  });

  it("binds the tooltip directive to the benchmark value", () => {
    mockGetSafeBenchmark.mockReturnValue("Mocked Benchmark Tooltip");
    createWrapper({ days: 250, context: "lb" });
    expect(vTooltip.mounted).toHaveBeenCalled();
    const call = vTooltip.mounted.mock.calls[0];
    expect(call[1].value).toBe("Mocked Benchmark Tooltip");
  });
});
