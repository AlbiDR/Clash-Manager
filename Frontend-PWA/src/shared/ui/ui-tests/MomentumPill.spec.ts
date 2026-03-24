/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import MomentumPill from "../MomentumPill.vue";

// Mock dependencies
const { mockGetSafeBenchmark, mockCalculateMomentum } = vi.hoisted(() => ({
  mockGetSafeBenchmark: vi.fn(),
  mockCalculateMomentum: vi.fn()
}));

vi.mock("@core/services/useBenchmarking", () => ({
  useBenchmarking: () => ({
    getSafeBenchmark: mockGetSafeBenchmark
  })
}));

vi.mock("@core/utils/formatters", () => ({
  calculateMomentum: mockCalculateMomentum
}));

// Mock directive
const vTooltip = {
  mounted: vi.fn(),
  updated: vi.fn()
};

describe("MomentumPill.vue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSafeBenchmark.mockReturnValue("Mocked Tooltip");
  });

  const createWrapper = (props = {}) => {
    return mount(MomentumPill, {
      props: {
        dt: 10,
        performanceRawScore: 100,
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

  it("renders correctly for 'up' trend", () => {
    mockCalculateMomentum.mockReturnValue({
      val: "10.0%",
      dir: "up",
      raw: 10
    });

    const wrapper = createWrapper();

    expect(wrapper.classes()).toContain("up");
    expect(wrapper.find(".trend-val").text()).toBe("10.0%");
    expect(wrapper.find(".mock-icon").attributes("name")).toBe("trend_up");
    expect(mockGetSafeBenchmark).toHaveBeenCalledWith("lb", "momentum", 10);
  });

  it("renders correctly for 'down' trend", () => {
    mockCalculateMomentum.mockReturnValue({
      val: "5.5%",
      dir: "down",
      raw: -5
    });

    const wrapper = createWrapper({ dt: -5 });

    expect(wrapper.classes()).toContain("down");
    expect(wrapper.find(".trend-val").text()).toBe("5.5%");
    expect(wrapper.find(".mock-icon").attributes("name")).toBe("trend_down");
    expect(mockGetSafeBenchmark).toHaveBeenCalledWith("lb", "momentum", -5);
  });

  it("does not render when calculateMomentum returns null", () => {
    mockCalculateMomentum.mockReturnValue(null);

    const wrapper = createWrapper();

    expect(wrapper.find(".momentum-pill").exists()).toBe(false);
  });

  it("handles undefined props gracefully", () => {
    mockCalculateMomentum.mockReturnValue(null);

    const wrapper = mount(MomentumPill, {
      props: {
        dt: undefined,
        performanceRawScore: undefined
      },
      global: {
        stubs: { Icon: true },
        directives: { tooltip: vTooltip }
      }
    });

    expect(wrapper.find(".momentum-pill").exists()).toBe(false);
    expect(mockCalculateMomentum).toHaveBeenCalledWith(0, 0);
  });
});
