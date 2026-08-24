// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import RosterView from "../RosterView.vue";
import type { LeaderboardMember } from "@core/types";

// The route-loader plugin isn't installed in this harness; the view only
// calls useClashDataLoader() for its side effect and never reads the
// result, so a no-op is a faithful stand-in.
vi.mock("vue-router/experimental", () => ({
  defineBasicLoader: () => () => {},
}));

const mockToggleExpand = vi.fn();
const mockToggleSelect = vi.fn();
const mockGetCardMetadata = vi.fn((id: string) => ({ expanded: id === "m1", selected: false }));
const mockGetMemoKeys = vi.fn((id: string, deps: unknown[]) => [id, ...deps]);

const mockMembers: LeaderboardMember[] = [
  {
    id: "m1", n: "Alice", t: 5000, performanceScore: 90, performanceRawScore: 15000,
    d: { role: "leader", days: 100, avg: 10, seen: "1h ago", rate: "80%", wfame: 3000, hist: "1,2,3", winRate: 0.6 },
  },
  {
    id: "m2", n: "Bob", t: 4000, performanceScore: 80, performanceRawScore: 12000,
    d: { role: "member", days: 50, avg: 5, seen: "2h ago", rate: "60%", wfame: 1000, hist: "1,2,3", winRate: 0.5 },
  },
];

const mockVisibleItems = ref(mockMembers);
const mockIsShowcaseMode = ref(false);

vi.mock("../../composables/useLeaderboard", () => ({
  useLeaderboard: () => ({
    visibleItems: mockVisibleItems,
    isShowcaseMode: mockIsShowcaseMode,
    toggleExpand: mockToggleExpand,
    toggleSelect: mockToggleSelect,
    layoutProps: ref({ status: { type: "success", text: "Ready" } }),
    layoutEvents: ref({}),
    getCardMetadata: mockGetCardMetadata,
    getMemoKeys: mockGetMemoKeys,
  }),
}));

function mountRosterView() {
  return mount(RosterView, {
    global: {
      stubs: {
        ConsoleLayout: {
          name: "ConsoleLayout",
          template: `
            <div class="console-layout-stub">
              <slot name="top"></slot>
              <slot></slot>
            </div>
          `,
        },
        MemberCard: {
          name: "MemberCard",
          template: '<div class="member-card-stub" :data-id="id" @click="$emit(\'toggle\')" @dblclick="$emit(\'toggle-select\')"></div>',
          props: ["id", "member", "expanded", "selected"],
        },
        VoyageBanner: {
          name: "VoyageBanner",
          template: '<div class="voyage-banner-stub"></div>',
        },
      },
    },
  });
}

describe("RosterView.vue", () => {
  it("renders the VoyageBanner in the layout's top slot", () => {
    const wrapper = mountRosterView();

    expect(wrapper.findComponent({ name: "VoyageBanner" }).exists()).toBe(true);
  });

  it("renders a MemberCard per visible member with the composable's per-card metadata", () => {
    const wrapper = mountRosterView();
    const cards = wrapper.findAllComponents({ name: "MemberCard" });

    expect(cards).toHaveLength(2);
    expect(cards[0].props("member")).toEqual(mockMembers[0]);
    expect(cards[0].props("expanded")).toBe(true);
    expect(cards[1].props("member")).toEqual(mockMembers[1]);
    expect(cards[1].props("expanded")).toBe(false);
    expect(mockGetCardMetadata).toHaveBeenCalledWith("m1");
    expect(mockGetCardMetadata).toHaveBeenCalledWith("m2");
  });

  it("wires a card's toggle event to toggleExpand with that card's id", async () => {
    const wrapper = mountRosterView();
    const firstCard = wrapper.findAllComponents({ name: "MemberCard" })[0];

    await firstCard.trigger("click");

    expect(mockToggleExpand).toHaveBeenCalledWith("m1");
  });

  it("wires a card's toggle-select event to toggleSelect with that card's id", async () => {
    const wrapper = mountRosterView();
    const secondCard = wrapper.findAllComponents({ name: "MemberCard" })[1];

    await secondCard.trigger("dblclick");

    expect(mockToggleSelect).toHaveBeenCalledWith("m2");
  });
});
