// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import MemberCard from "../MemberCard.vue";
import type { LeaderboardMember } from "@core/types";

// Mock Layer 1 services via deep imports to avoid Barrel side effects (ADR Section II)
vi.mock("../../../../core/services/useBenchmarking", () => ({
  useBenchmarking: () => ({
    getSafeBenchmark: vi.fn((type, metric, value) => `Benchmark: ${type} ${metric} ${value}`),
  }),
}));

vi.mock("../../../../core/utils/formatters", () => ({
  formatRole: vi.fn((role) => ({
    label: `Formatted ${role}`,
    class: `role-${role}`,
  })),
  formatTimeAgo: vi.fn((date) => `Time ago: ${date}`),
}));

const mockMember: LeaderboardMember = {
  id: "P12345",
  n: "Test Player",
  t: 7500,
  performanceScore: 85,
  performanceRawScore: 12345,
  dt: 5,
  d: {
    role: "elder",
    days: 100,
    avg: 500,
    seen: "2024-03-20T10:00:00Z",
    rate: "95%",
    wfame: 2500,
    hist: "3000 24W01 | 1500 24W02",
  },
};

describe("MemberCard.vue", () => {
  const defaultProps = {
    id: "P12345",
    member: mockMember,
    expanded: false,
    selected: false,
    selectionMode: false,
  };

  const mountMemberCard = (props = {}) => {
    return mount(MemberCard, {
      props: { ...defaultProps, ...props },
      global: {
        stubs: {
          BaseCard: {
            name: "BaseCard",
            template: `
              <div :aria-label="$attrs['aria-label']">
                <slot name="identity-meta"></slot>
                <slot name="identity-name"></slot>
                <slot name="score-section"></slot>
                <div v-if="expanded" class="expanded-content-stub">
                  <slot name="expanded-content"></slot>
                </div>
              </div>
            `,
            props: ["id", "expanded", "selected", "selectionMode", "isTagged", "score"],
          },
          Icon: true,
          MomentumPill: true,
          TrophyBadge: {
            name: "TrophyBadge",
            template: '<div class="trophy-val">{{ value || 0 }}</div>',
            props: ["value", "context"]
          },
          ScoreBadge: {
            name: "ScoreBadge",
            template: '<div class="stat-score">{{ Math.round(score || 0) }}</div>',
            props: ["score", "context", "dt", "performanceRawScore"]
          },
          TenureBadge: {
            name: "TenureBadge",
            template: '<div class="badge tenure">{{ days }}d</div>',
            props: ["days"]
          },
          StatisticItem: {
            name: "StatisticItem",
            template: '<div class="statistic-item-stub"></div>',
            props: ["label", "value", "loading", "benchmarkType", "benchmarkMetric", "benchmarkRawValue"]
          },
          CardActions: {
            name: "CardActions",
            template: '<div class="card-actions-stub"></div>',
            props: ["id", "loading", "compact"]
          },
          // Stubbing async component directly in global.stubs
          WarHistoryChart: {
            name: "WarHistoryChart",
            template: '<div class="war-history-chart-mock"></div>',
            props: ["history", "loading"]
          }
        },
        directives: {
          tooltip: vi.fn(),
        },
      },
    });
  };

  it("renders member identity correctly", () => {
    const wrapper = mountMemberCard();

    expect(wrapper.find(".player-name").text()).toBe("Test Player");
    expect(wrapper.find(".tenure").text()).toBe("100d");
    expect(wrapper.find(".role").text()).toBe("Formatted elder");
    expect(wrapper.find(".role").classes()).toContain("role-elder");
  });

  it("renders trophies and performance score", () => {
    const wrapper = mountMemberCard();

    expect(wrapper.find(".trophy-val").text()).toBe("7500");
    expect(wrapper.find(".stat-score").text()).toBe("85");
  });

  it("handles null trophies", () => {
    const memberWithNullTrophies = { ...mockMember, t: null as any };
    const wrapper = mountMemberCard({ member: memberWithNullTrophies });

    expect(wrapper.find(".trophy-val").text()).toBe("0");
  });

  it("applies aria-label correctly for accessibility", () => {
    const wrapper = mountMemberCard();
    const baseCardStub = wrapper.find('[aria-label="Test Player, score 85, Formatted elder"]');

    expect(baseCardStub.exists()).toBe(true);
  });

  it("renders expanded content when expanded is true", () => {
    const wrapper = mountMemberCard({ expanded: true });

    const statsGrid = wrapper.find(".stats-grid");
    expect(statsGrid.exists()).toBe(true);
    expect(statsGrid.attributes("aria-busy")).toBe("false");

    expect(wrapper.find(".war-history-chart-mock").exists()).toBe(true);
    expect(wrapper.find(".card-actions-stub").exists()).toBe(true);
  });

  it("shows refreshing state in expanded content", () => {
    const wrapper = mountMemberCard({ expanded: true, appIsRefreshing: true });

    expect(wrapper.find(".stats-grid").attributes("aria-busy")).toBe("true");
    expect(wrapper.findComponent({ name: "WarHistoryChart" }).props("loading")).toBe(true);
    expect(wrapper.findComponent({ name: "CardActions" }).props("loading")).toBe(true);
  });

  it("emits toggle event when BaseCard emits toggle", async () => {
    const wrapper = mountMemberCard();
    const baseCard = wrapper.findComponent({ name: "BaseCard" });

    await baseCard.vm.$emit("toggle");
    expect(wrapper.emitted("toggle")).toBeTruthy();
  });

  it("emits toggle-select event when BaseCard emits toggle-select", async () => {
    const wrapper = mountMemberCard();
    const baseCard = wrapper.findComponent({ name: "BaseCard" });

    await baseCard.vm.$emit("toggle-select");
    expect(wrapper.emitted("toggle-select")).toBeTruthy();
  });
});
