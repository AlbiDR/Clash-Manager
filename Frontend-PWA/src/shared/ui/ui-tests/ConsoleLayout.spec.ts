import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import ConsoleLayout from "../ConsoleLayout.vue";
import { defineComponent, h, nextTick } from "vue";

// Mock Core Services (Deep Imports per Mocking Rule)
const mockSetFabVisible = vi.fn();
const mockUpdateFabState = vi.fn();

vi.mock("../../../core/services/useUiCoordinator", () => ({
  useUiCoordinator: () => ({
    setFabVisible: mockSetFabVisible,
    updateFabState: mockUpdateFabState,
  }),
}));

vi.mock("../../../core/services/useHaptics", () => ({
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
const MockSkeleton = defineComponent({
  name: "MockSkeleton",
  render: () => h("div", { class: "mock-skeleton" }, "Loading..."),
});

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
    expect(wrapper.find(".list-container").exists()).toBe(true);
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
  });

  it("synchronizes FAB state correctly", async () => {
    const fabState = {
      visible: true,
      label: "Action",
      isProcessing: false,
      isBlasting: false,
      selectionCount: 0,
      blitzEnabled: false,
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
});
