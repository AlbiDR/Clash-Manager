// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import TrajectoryList from "../TrajectoryList.vue";
import TrajectoryItem from "../TrajectoryItem.vue";
import { useProgressiveList } from "@core/services/useProgressiveList";

// Mock the progressive list service
vi.mock("@core/services/useProgressiveList", () => ({
  useProgressiveList: vi.fn()
}));

describe("TrajectoryList.vue", () => {
  const mockActions = [
    { cardName: "Knight", currentLevel: 13, targetLevel: 14, rarity: "Common", upgradeType: "Direct", efficiencyIndex: 1.2, goldCost: 100000, xpGained: 1600 },
    { cardName: "Archer", currentLevel: 12, targetLevel: 13, rarity: "Common", upgradeType: "Direct", efficiencyIndex: 1.1, goldCost: 50000, xpGained: 800 }
  ];

  const mockGetTrajectoryMemoKeys = vi.fn((upgrade) => [upgrade.cardName, upgrade.targetLevel]);

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock behavior: return the first 20 items (or all if less)
    (useProgressiveList as any).mockImplementation((list: any, size: number) => ({
      visibleItems: ref(list.value.slice(0, size))
    }));
  });

  const createWrapper = (props = {}) => {
    return mount(TrajectoryList, {
      props: {
        actions: mockActions,
        getTrajectoryMemoKeys: mockGetTrajectoryMemoKeys,
        ...props
      },
      global: {
        stubs: {
          Icon: {
            template: '<span class="mock-icon" :name="name"></span>',
            props: ['name']
          },
          TrajectoryItem: {
            template: '<div class="mock-trajectory-item" :index="index"></div>',
            props: ['upgrade', 'index']
          }
        }
      }
    });
  };

  it("renders the section title and icon", () => {
    const wrapper = createWrapper();
    expect(wrapper.find(".section-title").text()).toContain("Recommended Trajectory");
    expect(wrapper.find(".mock-icon").attributes("name")).toBe("trend_up");
  });

  it("calls useProgressiveList with correct parameters", () => {
    createWrapper();
    expect(useProgressiveList).toHaveBeenCalledWith(expect.anything(), 20);
  });

  it("renders TrajectoryItem components for visible items", () => {
    const wrapper = createWrapper();
    const items = wrapper.findAll(".mock-trajectory-item");
    expect(items).toHaveLength(2);
    expect(items[0].attributes("index")).toBe("0");
    expect(items[1].attributes("index")).toBe("1");
  });

  it("handles empty actions list gracefully", () => {
    (useProgressiveList as any).mockImplementation(() => ({
      visibleItems: ref([])
    }));
    const wrapper = createWrapper({ actions: [] });
    expect(wrapper.findAll(".mock-trajectory-item")).toHaveLength(0);
    expect(wrapper.find(".section-title").exists()).toBe(true);
  });

  it("passes the correct index to TrajectoryItem for multiple items", () => {
    const manyActions = Array.from({ length: 5 }, (_, i) => ({
      ...mockActions[0],
      cardName: `Card ${i}`
    }));
    const wrapper = createWrapper({ actions: manyActions });
    const items = wrapper.findAll(".mock-trajectory-item");
    items.forEach((item, index) => {
      expect(item.attributes("index")).toBe(index.toString());
    });
  });
});
