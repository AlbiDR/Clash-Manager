// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import RecruitCard from "../RecruitCard.vue";
import type { Recruit } from "@core/types";

// Mock Layer 1 services via deep imports to avoid Barrel side effects (ADR Section II)
vi.mock("../../../../core/utils/time", () => ({
  formatTimeAgo: vi.fn((date) => `Time ago: ${date}`),
}));

const mockRecruit: Recruit = {
  id: "R12345",
  n: "Test Recruit",
  t: 6500,
  potentialScore: 92,
  potentialRawScore: 15000,
  longevity: 2880,
  longevityLabel: "Time ago: 2d",
  d: {
    don: 250,
    war: 12,
    ago: "2d",
    cards: 4500,
    winRate: 0.564,
  },
};

describe("RecruitCard.vue", () => {
  const defaultProps = {
    id: "R12345",
    recruit: mockRecruit,
    expanded: false,
    selected: false,
    selectionMode: false,
  };

  const mountRecruitCard = (props = {}) => {
    return mount(RecruitCard, {
      props: { ...defaultProps, ...props },
      global: {
        stubs: {
          BaseCard: {
            name: "BaseCard",
            template: `
              <div class="base-card-stub">
                <slot name="identity-meta"></slot>
                <slot name="identity-name"></slot>
                <slot name="score-section"></slot>
                <div v-if="expanded" class="expanded-content-stub">
                  <slot name="expanded-content"></slot>
                </div>
              </div>
            `,
            props: ["id", "expanded", "selected", "selectionMode", "score"],
          },
          TrophyBadge: {
            name: "TrophyBadge",
            template: '<div class="trophy-val">{{ value || 0 }}</div>',
            props: ["value", "context"]
          },
          ScoreBadge: {
            name: "ScoreBadge",
            template: '<div class="stat-score">{{ Math.round(score || 0) }}</div>',
            props: ["score", "context"]
          },
          StatisticItem: {
            name: "StatisticItem",
            template: '<div class="statistic-item-stub">{{ label }}: {{ value }}</div>',
            props: ["label", "value", "loading", "benchmarkType", "benchmarkMetric", "benchmarkRawValue"]
          },
          CardActions: {
            name: "CardActions",
            template: '<div class="card-actions-stub"></div>',
            props: ["id", "loading", "compact"]
          }
        }
      },
    });
  };

  it("renders recruit identity correctly", () => {
    const wrapper = mountRecruitCard();

    expect(wrapper.find(".player-name").text()).toBe("Test Recruit");
    expect(wrapper.find(".badge.tag").text()).toBe("#R1234");
    expect(wrapper.find(".badge.time").text()).toBe("Time ago: 2d");
  });

  it("renders trophies and potential score", () => {
    const wrapper = mountRecruitCard();

    expect(wrapper.find(".trophy-val").text()).toBe("6500");
    expect(wrapper.find(".stat-score").text()).toBe("92");
  });

  it("renders expanded content when expanded is true", () => {
    const wrapper = mountRecruitCard({ expanded: true });

    const expandedContent = wrapper.find(".expanded-content-stub");
    expect(expandedContent.exists()).toBe(true);

    const statsGrid = wrapper.find(".stats-grid");
    expect(statsGrid.exists()).toBe(true);
    expect(statsGrid.attributes("aria-busy")).toBe("false");

    const statItems = wrapper.findAllComponents({ name: "StatisticItem" });
    expect(statItems).toHaveLength(5);
    expect(statItems[0].props("label")).toBe("Donations");
    expect(statItems[0].props("value")).toBe(250);
    expect(statItems[1].props("label")).toBe("Win Rate");
    expect(statItems[1].props("value")).toBe("56.4%");
    expect(statItems[2].props("label")).toBe("Cards Won");
    expect(statItems[2].props("value")).toBe(4500);
    expect(statItems[3].props("label")).toBe("War Wins");
    expect(statItems[3].props("value")).toBe(12);
    expect(statItems[4].props("label")).toBe("RPoS");
    expect(statItems[4].props("value")).toBe("15,000");
    expect(statItems[4].props("benchmarkMetric")).toBe("rawScore");

    expect(wrapper.findComponent({ name: "CardActions" }).exists()).toBe(true);
  });

  it("shows refreshing state in expanded content", () => {
    const wrapper = mountRecruitCard({ expanded: true, appIsRefreshing: true });

    expect(wrapper.find(".stats-grid").attributes("aria-busy")).toBe("true");

    const statItems = wrapper.findAllComponents({ name: "StatisticItem" });
    statItems.forEach(item => {
      expect(item.props("loading")).toBe(true);
    });

    expect(wrapper.findComponent({ name: "CardActions" }).props("loading")).toBe(true);
  });

  it("emits toggle event when BaseCard emits toggle", async () => {
    const wrapper = mountRecruitCard();
    const baseCard = wrapper.findComponent({ name: "BaseCard" });

    await baseCard.vm.$emit("toggle");
    expect(wrapper.emitted("toggle")).toBeTruthy();
  });

  it("emits toggle-select event when BaseCard emits toggle-select", async () => {
    const wrapper = mountRecruitCard();
    const baseCard = wrapper.findComponent({ name: "BaseCard" });

    await baseCard.vm.$emit("toggle-select");
    expect(wrapper.emitted("toggle-select")).toBeTruthy();
  });

  it("caps the displayed win rate at 100% if props.recruit.d.winRate is greater than 1.0", () => {
    const inflatedRecruit = {
      ...mockRecruit,
      d: {
        ...mockRecruit.d,
        winRate: 1.25, // 125%
      },
    };

    const wrapper = mountRecruitCard({ recruit: inflatedRecruit, expanded: true });

    const statItems = wrapper.findAllComponents({ name: "StatisticItem" });
    const winRateItem = statItems.find(item => item.props("label") === "Win Rate");
    expect(winRateItem).toBeDefined();
    expect(winRateItem!.props("value")).toBe("100%");
  });
});
