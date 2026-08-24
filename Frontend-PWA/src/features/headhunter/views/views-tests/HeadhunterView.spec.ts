// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import HeadhunterView from "../HeadhunterView.vue";
import type { Recruit } from "@core/types";

// The route-loader plugin isn't installed in this harness; the view only
// calls useClashDataLoader() for its side effect and never reads the
// result, so a no-op is a faithful stand-in.
vi.mock("vue-router/experimental", () => ({
  defineBasicLoader: () => () => {},
}));

const mockRefresh = vi.fn();
const mockToggleExpand = vi.fn();
const mockToggleSelect = vi.fn();
const mockGetCardMetadata = vi.fn((id: string) => ({ expanded: id === "r1", selected: false }));
const mockGetMemoKeys = vi.fn((id: string, deps: unknown[]) => [id, ...deps]);

const mockRecruits: Recruit[] = [
  {
    id: "r1", n: "Alice", t: 5000, potentialScore: 90, potentialRawScore: 15000,
    longevity: 100, longevityLabel: "veteran", lastScan: 1700000000000,
    d: { don: 100, war: 5, ago: "1h", cards: 10, winRate: 0.6 },
  },
  {
    id: "r2", n: "Bob", t: 4000, potentialScore: 80, potentialRawScore: 12000,
    longevity: 50, longevityLabel: "rookie", lastScan: 1700000000000,
    d: { don: 50, war: 2, ago: "2h", cards: 5, winRate: 0.5 },
  },
];

const mockVisibleItems = ref(mockRecruits);
const mockIsShowcaseMode = ref(false);

vi.mock("../../composables/useRecruiter", () => ({
  useRecruiter: () => ({
    visibleItems: mockVisibleItems,
    isShowcaseMode: mockIsShowcaseMode,
    refresh: mockRefresh,
    toggleExpand: mockToggleExpand,
    toggleSelect: mockToggleSelect,
    layoutProps: ref({ status: { type: "success", text: "Ready" } }),
    layoutEvents: ref({}),
    getCardMetadata: mockGetCardMetadata,
    getMemoKeys: mockGetMemoKeys,
  }),
}));

function mountHeadhunterView() {
  return mount(HeadhunterView, {
    global: {
      directives: { tactile: {} },
      stubs: {
        ConsoleLayout: {
          name: "ConsoleLayout",
          template: `
            <div class="console-layout-stub">
              <slot name="empty-action"></slot>
              <slot></slot>
            </div>
          `,
        },
        RecruitCard: {
          name: "RecruitCard",
          template: '<div class="recruit-card-stub" :data-id="id" @click="$emit(\'toggle\')" @dblclick="$emit(\'toggle-select\')"></div>',
          props: ["id", "recruit", "expanded", "selected"],
        },
      },
    },
  });
}

describe("HeadhunterView.vue", () => {
  it("renders a RecruitCard per visible recruit with the composable's per-card metadata", () => {
    const wrapper = mountHeadhunterView();
    const cards = wrapper.findAllComponents({ name: "RecruitCard" });

    expect(cards).toHaveLength(2);
    expect(cards[0].props("recruit")).toEqual(mockRecruits[0]);
    expect(cards[0].props("expanded")).toBe(true);
    expect(cards[1].props("recruit")).toEqual(mockRecruits[1]);
    expect(cards[1].props("expanded")).toBe(false);
    expect(mockGetCardMetadata).toHaveBeenCalledWith("r1");
    expect(mockGetCardMetadata).toHaveBeenCalledWith("r2");
  });

  it("wires a card's toggle event to toggleExpand with that card's id", async () => {
    const wrapper = mountHeadhunterView();
    const firstCard = wrapper.findAllComponents({ name: "RecruitCard" })[0];

    await firstCard.trigger("click");

    expect(mockToggleExpand).toHaveBeenCalledWith("r1");
  });

  it("wires a card's toggle-select event to toggleSelect with that card's id", async () => {
    const wrapper = mountHeadhunterView();
    const secondCard = wrapper.findAllComponents({ name: "RecruitCard" })[1];

    await secondCard.trigger("dblclick");

    expect(mockToggleSelect).toHaveBeenCalledWith("r2");
  });

  it("calls refresh when the empty-action button is clicked", async () => {
    const wrapper = mountHeadhunterView();

    await wrapper.find(".btn-primary").trigger("click");

    expect(mockRefresh).toHaveBeenCalled();
  });
});
