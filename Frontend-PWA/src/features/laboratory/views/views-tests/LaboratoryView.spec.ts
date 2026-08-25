// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { mount, RouterLinkStub } from "@vue/test-utils";
import { ref } from "vue";
import LaboratoryView from "../LaboratoryView.vue";

// The route-loader plugin isn't installed in this harness; the view only
// calls useClashDataLoader() for its side effect and never reads the
// result, so a no-op is a faithful stand-in.
vi.mock("vue-router/experimental", () => ({
  defineBasicLoader: () => () => {},
}));

const mockPlayerTag = ref<string | null>("#TAG123");

vi.mock("@core/services/useClashDataStore", () => ({
  useClashDataStore: () => ({
    data: ref({ playerTag: mockPlayerTag.value }),
  }),
}));

const mockRefresh = vi.fn();
const mockSetTrackedPlayerTag = vi.fn();
const mockSetSettings = vi.fn();
const mockHandleVaultUpdate = vi.fn();
const mockGetTrajectoryMemoKeys = vi.fn((upgrade: unknown) => [upgrade]);

const mockObservation = ref<unknown>(null);
const mockOperation = ref<unknown>(null);

const mockInventory = { gold: 100000, gems: 1000, wildCards: {} } as any;
const mockProfile = { name: "Debug Player", tag: "#DEBUG", kingLevel: 76 } as any;
const mockSettings = { strategy: "Level Projection", allowGemSpending: false, infiniteResources: true } as any;

vi.mock("../../composables/useLaboratory", () => ({
  useLaboratory: () => ({
    observation: mockObservation,
    operation: mockOperation,
    isSimulating: ref(false),
    isFetching: ref(false),
    settings: mockSettings,
    layoutProps: ref({ status: { type: "success", text: "Ready" } }),
    layoutEvents: ref({}),
    setSettings: mockSetSettings,
    handleVaultUpdate: mockHandleVaultUpdate,
    getTrajectoryMemoKeys: mockGetTrajectoryMemoKeys,
    refresh: mockRefresh,
    setTrackedPlayerTag: mockSetTrackedPlayerTag,
    trackedPlayerTag: ref("#TAG123"),
  }),
}));

function mountLaboratoryView() {
  return mount(LaboratoryView, {
    global: {
      stubs: {
        ConsoleLayout: {
          name: "ConsoleLayout",
          template: `
            <div class="console-layout-stub">
              <slot name="header-filters"></slot>
              <slot name="empty-action"></slot>
              <slot></slot>
            </div>
          `,
        },
        RouterLink: RouterLinkStub,
        TargetPicker: {
          name: "TargetPicker",
          template: '<div class="target-picker-stub" @click="$emit(\'lock-in\', \'#NEWTAG\')"></div>',
          props: ["trackedTag", "playerName", "isFetching"],
        },
        VaultCard: {
          name: "VaultCard",
          template: '<div class="vault-card-stub" @click="$emit(\'update\', \'gold\', 500)"></div>',
          props: ["inventory", "isSimulating"],
        },
        ParameterCard: {
          name: "ParameterCard",
          template: '<div class="parameter-card-stub" @click="$emit(\'update\', { targetLevel: 80 })"></div>',
          props: ["settings", "currentLevel", "operation"],
        },
        SummaryCard: {
          name: "SummaryCard",
          template: '<div class="summary-card-stub"></div>',
          props: ["result", "profile", "settings"],
        },
        TrajectoryList: {
          name: "TrajectoryList",
          template: '<div class="trajectory-list-stub"></div>',
          props: ["actions", "getTrajectoryMemoKeys"],
        },
      },
    },
  });
}

describe("LaboratoryView.vue", () => {
  it("wires TargetPicker's lock-in event to setTrackedPlayerTag and refresh", async () => {
    const wrapper = mountLaboratoryView();

    await wrapper.find(".target-picker-stub").trigger("click");

    expect(mockSetTrackedPlayerTag).toHaveBeenCalledWith("#NEWTAG");
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("shows the settings CTA when there is no player tag and no observation yet", () => {
    mockPlayerTag.value = null;
    mockObservation.value = null;
    const wrapper = mountLaboratoryView();

    const link = wrapper.findComponent(RouterLinkStub);
    expect(link.exists()).toBe(true);
    expect(link.props("to")).toBe("/settings");
  });

  it("hides the settings CTA once a player tag is set", () => {
    mockPlayerTag.value = "#TAG123";
    const wrapper = mountLaboratoryView();

    expect(wrapper.findComponent(RouterLinkStub).exists()).toBe(false);
  });

  it("does not render the dashboard until observation is available", () => {
    mockObservation.value = null;
    const wrapper = mountLaboratoryView();

    expect(wrapper.find(".dashboard-grid").exists()).toBe(false);
  });

  describe("once observation is available", () => {
    it("renders VaultCard and ParameterCard wired to their update handlers", async () => {
      mockObservation.value = { inventory: mockInventory, profile: mockProfile };
      mockOperation.value = null;
      const wrapper = mountLaboratoryView();

      expect(wrapper.find(".dashboard-grid").exists()).toBe(true);
      const vaultCard = wrapper.findComponent({ name: "VaultCard" });
      expect(vaultCard.props("inventory")).toEqual(mockInventory);

      await wrapper.find(".vault-card-stub").trigger("click");
      expect(mockHandleVaultUpdate).toHaveBeenCalledWith("gold", 500);

      await wrapper.find(".parameter-card-stub").trigger("click");
      expect(mockSetSettings).toHaveBeenCalledWith({ targetLevel: 80 });

      expect(wrapper.findComponent({ name: "SummaryCard" }).exists()).toBe(false);
      expect(wrapper.findComponent({ name: "TrajectoryList" }).exists()).toBe(false);
    });

    it("renders SummaryCard and TrajectoryList once a simulation operation exists", () => {
      mockObservation.value = { inventory: mockInventory, profile: mockProfile };
      mockOperation.value = { actions: [{ cardName: "Knight" }], finalProfile: mockProfile };
      const wrapper = mountLaboratoryView();

      const summaryCard = wrapper.findComponent({ name: "SummaryCard" });
      expect(summaryCard.exists()).toBe(true);
      expect(summaryCard.props("result")).toEqual(mockOperation.value);

      expect(wrapper.findComponent({ name: "TrajectoryList" }).exists()).toBe(true);
    });

    it("hides TrajectoryList when the operation has no actions", () => {
      mockObservation.value = { inventory: mockInventory, profile: mockProfile };
      mockOperation.value = { actions: [], finalProfile: mockProfile };
      const wrapper = mountLaboratoryView();

      expect(wrapper.findComponent({ name: "SummaryCard" }).exists()).toBe(true);
      expect(wrapper.findComponent({ name: "TrajectoryList" }).exists()).toBe(false);
    });
  });
});
