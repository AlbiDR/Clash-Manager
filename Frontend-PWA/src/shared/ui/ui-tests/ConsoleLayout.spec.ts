// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import ConsoleLayout from "../ConsoleLayout.vue";
import EmptyState from "../EmptyState.vue";
import { defineComponent, h, KeepAlive, nextTick, markRaw, shallowRef, type Component } from "vue";

// Mock Core Services (Deep Imports per Mocking Rule)
const mockSetFabVisible = vi.fn();
const mockUpdateFabState = vi.fn();

vi.mock("../../../core/services/useUiCoordinator", () => ({
  useUiCoordinator: () => ({
    setFabVisible: mockSetFabVisible,
    updateFabState: mockUpdateFabState,
  }),
}));

vi.mock("@shared/composables/useHaptics", () => ({
  useHaptics: () => ({
    impact: vi.fn(),
    selection: vi.fn(),
    tap: vi.fn(),
  }),
}));

vi.mock("../../../core/services/useShowcaseMode", () => ({
  useShowcaseMode: () => ({
    isShowcaseMode: { value: false },
  }),
}));

const mockIsBlueprintMode = { value: false };
vi.mock("../../../core/services/useBlueprintMode", () => ({
  useBlueprintMode: () => ({
    isBlueprintMode: mockIsBlueprintMode,
  }),
}));

// Mock Shared Composables
const mockOnTouchStart = vi.fn();
const mockOnTouchMove = vi.fn();
const mockOnTouchEnd = vi.fn();

vi.mock("../../composables/usePullToRefresh", () => ({
  usePullToRefresh: () => ({
    isPulling: { value: false },
    ptrStyle: { transform: "translateY(0px)" },
    onTouchStart: mockOnTouchStart,
    onTouchMove: mockOnTouchMove,
    onTouchEnd: mockOnTouchEnd,
  }),
}));

// Dummy components for testing
const MockSkeleton = markRaw(
  defineComponent({
    name: "MockSkeleton",
    render: () => h("div", { class: "mock-skeleton" }, "Loading..."),
  })
);

describe("ConsoleLayout", () => {
  const defaultProps = {
    title: "Test Title",
    status: { type: "ready" as const, text: "Ready" },
    skeletonComponent: MockSkeleton,
  };

  const globalConfig = {
    stubs: {
      ConsoleHeader: true,
      Icon: true,
      EmptyState: true,
      ErrorState: true,
      SelectionBar: true,
      HeaderInfoOverlay: true,
      FloatingDock: true,
    },
    directives: {
      "auto-animate": vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsBlueprintMode.value = false;
  });

  it("renders the title and content slot correctly", () => {
    const wrapper = mount(ConsoleLayout, {
      props: defaultProps,
      slots: {
        default: '<div class="test-content">Main Content</div>',
      },
      global: globalConfig,
    });

    expect(wrapper.text()).toContain("Main Content");
    const header = wrapper.findComponent({ name: "ConsoleHeader" });
    expect(header.props("title")).toBe("Test Title");
  });

  it("renders loading state with skeletons", () => {
    const wrapper = mount(ConsoleLayout, {
      props: {
        ...defaultProps,
        loading: true,
      },
      global: globalConfig,
    });

    const skeletons = wrapper.findAll(".mock-skeleton");
    expect(skeletons.length).toBe(8);
    const loadingRegion = wrapper.find(".skeleton-list");
    expect(loadingRegion.attributes("role")).toBe("status");
    expect(loadingRegion.attributes("aria-busy")).toBe("true");
    expect(loadingRegion.attributes("aria-label")).toBe("Loading Test Title");
    expect(skeletons.every((skeleton) => skeleton.attributes("aria-hidden") === "true")).toBe(true);
  });

  it("forces skeleton display when Blueprint Mode is active", () => {
    mockIsBlueprintMode.value = true;
    const wrapper = mount(ConsoleLayout, {
      props: { ...defaultProps, loading: false },
      global: globalConfig,
    });

    expect(wrapper.findAll(".mock-skeleton").length).toBe(8);
  });

  it("ignoreBlueprintMode opts out of the automatic whole-slot swap even while Blueprint Mode is active", () => {
    // SettingsView.vue sets this because ConsoleLayout's built-in swap is
    // all-or-nothing, and it needs to keep one card (ModeSettings, which
    // hosts Blueprint's own on/off toggle) real and in its normal position
    // while doing its own per-card swap for everything else - see the
    // decision log on the ignoreBlueprintMode prop.
    mockIsBlueprintMode.value = true;
    const wrapper = mount(ConsoleLayout, {
      props: { ...defaultProps, loading: false, ignoreBlueprintMode: true },
      slots: { default: '<div class="real-content">Real settings content</div>' },
      global: globalConfig,
    });

    expect(wrapper.find(".real-content").exists()).toBe(true);
    expect(wrapper.findAll(".mock-skeleton").length).toBe(0);
  });

  it("renders empty state when isEmpty is true", () => {
    const wrapper = mount(ConsoleLayout, {
      props: {
        ...defaultProps,
        isEmpty: true,
      },
      global: globalConfig,
    });

    expect(wrapper.findComponent({ name: "EmptyState" }).exists()).toBe(true);
  });

  it("offers a direct recovery action for a filtered-empty console", async () => {
    const wrapper = mount(ConsoleLayout, {
      props: {
        ...defaultProps,
        isEmpty: true,
        searchQuery: "No match",
      },
      global: {
        ...globalConfig,
        stubs: {
          ...globalConfig.stubs,
          EmptyState,
        },
      },
    });

    await wrapper.find(".empty-recovery-action").trigger("click");

    expect(wrapper.emitted("update:search")).toEqual([[""]]);
  });

  it("does not compete with Clear search using a feature empty action", () => {
    const wrapper = mount(ConsoleLayout, {
      props: {
        ...defaultProps,
        isEmpty: true,
        searchQuery: "No match",
      },
      slots: {
        "empty-action": '<button class="feature-empty-action">Scan Again</button>',
      },
      global: {
        ...globalConfig,
        stubs: {
          ...globalConfig.stubs,
          EmptyState,
        },
      },
    });

    expect(wrapper.find(".empty-recovery-action").exists()).toBe(true);
    expect(wrapper.find(".feature-empty-action").exists()).toBe(false);
  });

  it("renders error state when syncError and isEmpty are present", () => {
    const wrapper = mount(ConsoleLayout, {
      props: {
        ...defaultProps,
        isEmpty: true,
        syncError: "Network Error",
      },
      global: globalConfig,
    });

    const errorState = wrapper.findComponent({ name: "ErrorState" });
    expect(errorState.exists()).toBe(true);
    expect(errorState.props("message")).toBe("Network Error");
    expect(errorState.props("title")).toBe("Test Title");
  });

  it("synchronizes FAB state correctly", async () => {
    const fabState = {
      visible: true,
      label: "Action",
      isProcessing: false,
      selectionCount: 0,
      actions: [{ id: "action", label: "Action", icon: "check" }],
      dismissLabel: "Dismiss selected entries",
    };

    const wrapper = mount(ConsoleLayout, {
      props: {
        ...defaultProps,
        fabState,
      },
      global: globalConfig,
    });

    expect(mockUpdateFabState).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Action",
        actions: [{ id: "action", label: "Action", icon: "check" }],
        onCommand: expect.any(Function),
        dismissLabel: "Dismiss selected entries",
        onCancelOperation: expect.any(Function),
      })
    );

    await nextTick();
    expect(mockSetFabVisible).toHaveBeenCalledWith(true);

    await wrapper.setProps({
      fabState: { ...fabState, visible: false, label: "New Label" },
    });

    expect(mockUpdateFabState).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "New Label",
      })
    );
    await nextTick();
    expect(mockSetFabVisible).toHaveBeenCalledWith(false);
  });

  it("restores FAB visibility when a cached console is activated again", async () => {
    const PassiveView = defineComponent({ render: () => h("div", "Passive") });
    const activeView = shallowRef<Component>(ConsoleLayout);
    const fabState = {
      visible: true,
      label: "Action",
      isProcessing: false,
      selectionCount: 1,
      actions: [{ id: "action", label: "Action", icon: "check" }],
    };
    const Host = defineComponent({
      setup: () => () => h(KeepAlive, null, [
        activeView.value === ConsoleLayout
          ? h(ConsoleLayout, { ...defaultProps, fabState })
          : h(PassiveView),
      ]),
    });
    mount(Host, { global: globalConfig });
    await nextTick();

    activeView.value = PassiveView;
    await nextTick();
    expect(mockSetFabVisible).toHaveBeenLastCalledWith(false);

    activeView.value = ConsoleLayout;
    await nextTick();
    await nextTick();
    expect(mockSetFabVisible).toHaveBeenLastCalledWith(true);
  });

  it("emits a domain-blind active-operation cancellation event", () => {
    const wrapper = mount(ConsoleLayout, {
      props: {
        ...defaultProps,
        fabState: {
          visible: true,
          label: "1 / 2",
          isProcessing: false,
          selectionCount: 2,
          actions: [],
          activity: {
            label: "Blitz",
            status: "1 / 2",
            cancelLabel: "Cancel Blitz",
            exclusive: true,
          },
        },
      },
      global: globalConfig,
    });

    const latestCoordinatorState = mockUpdateFabState.mock.calls.at(-1)![0];
    latestCoordinatorState.onCancelOperation();

    expect(wrapper.emitted("fab-cancel-operation")).toEqual([[]]);
    expect(wrapper.emitted("fab-dismiss")).toBeUndefined();
  });

  it("handles pull-to-refresh interactions", async () => {
    const wrapper = mount(ConsoleLayout, {
      props: defaultProps,
      global: globalConfig,
    });

    const content = wrapper.find(".view-content");
    await content.trigger("touchstart");
    expect(mockOnTouchStart).toHaveBeenCalled();

    await content.trigger("touchmove");
    expect(mockOnTouchMove).toHaveBeenCalled();

    await content.trigger("touchend");
    expect(mockOnTouchEnd).toHaveBeenCalled();
  });

  it("emits refresh when ConsoleHeader emits refresh", async () => {
    const wrapper = mount(ConsoleLayout, {
      props: defaultProps,
      global: {
        ...globalConfig,
        stubs: {
          ...globalConfig.stubs,
          ConsoleHeader: {
            template: '<div class="mock-header" @click="$emit(\'refresh\')">Header</div>',
          },
        }
      },
    });

    await wrapper.find(".mock-header").trigger("click");
    expect(wrapper.emitted("refresh")).toBeTruthy();
  });

  it("synchronizes feature commands and activity callbacks correctly", () => {
    const actions = [
      { id: "harvest-global", label: "Global Harvest", icon: "globe" },
      { id: "harvest-local", label: "Local Harvest", icon: "map_pin" },
    ];
    const fabState = {
      visible: true,
      label: "Action",
      isProcessing: false,
      selectionCount: 0,
      actions,
      activity: {
        label: "Harvest",
        status: "Global Harvest in progress",
        cancelLabel: "Abort Harvest",
      },
    };

    const wrapper = mount(ConsoleLayout, {
      props: {
        ...defaultProps,
        fabState,
      },
      global: globalConfig,
    });

    expect(mockUpdateFabState).toHaveBeenCalledWith(
      expect.objectContaining({
        actions,
        activity: fabState.activity,
        onCommand: expect.any(Function),
        onCancelOperation: expect.any(Function),
      })
    );

    const calls = mockUpdateFabState.mock.calls;
    const lastCallArg = calls[calls.length - 1][0];
    
    const event = new MouseEvent("click");
    lastCallArg.onCommand("harvest-global", event);
    lastCallArg.onCommand("harvest-local", event);
    lastCallArg.onCancelOperation();

    expect(wrapper.emitted("fab-command")).toEqual([
      ["harvest-global", event],
      ["harvest-local", event],
    ]);
    expect(wrapper.emitted("fab-cancel-operation")).toEqual([[]]);
  });
});
