/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import FloatingDock from "../FloatingDock.vue";
import * as uiCoord from "../../composables/useUiCoordinator";

vi.mock("vue-router", () => ({
  useRoute: () => ({ path: "/" }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("../../../core/services/useHaptics", () => ({
  useHaptics: () => ({ tap: vi.fn() }),
}));

vi.mock("../../composables/useUiCoordinator", async (importOriginal) => {
  const actual = await importOriginal<typeof uiCoord>();
  return {
    ...actual,
    useUiCoordinator: vi.fn(),
  };
});

describe("FloatingDock.vue", () => {
  it("renders navigation items when dock is visible", () => {
    vi.mocked(uiCoord.useUiCoordinator).mockReturnValue({
      dockVisible: true,
      fabState: { selectionCount: 0, isBlasting: false },
    } as any);

    const wrapper = mount(FloatingDock);
    expect(wrapper.findAll(".dock-item").length).toBeGreaterThan(0);
  });

  it("shows dismiss button as compact when items are selected", async () => {
    const mockFabState = {
      selectionCount: 5,
      isBlasting: false,
      label: "Action",
    };
    
    vi.mocked(uiCoord.useUiCoordinator).mockReturnValue({
      dockVisible: false,
      fabState: mockFabState,
    } as any);

    const wrapper = mount(FloatingDock);
    
    const dismissBtn = wrapper.find(".fab-btn.danger");
    expect(dismissBtn.classes()).toContain("compact");
  });

  it("shows dismiss button as non-compact when nothing is selected and not blasting", async () => {
    const mockFabState = {
      selectionCount: 0,
      isBlasting: false,
      label: "Action",
    };
    
    vi.mocked(uiCoord.useUiCoordinator).mockReturnValue({
      dockVisible: false,
      fabState: mockFabState,
    } as any);

    const wrapper = mount(FloatingDock, {
      global: {
        stubs: {
          Icon: true,
          tooltip: true
        }
      }
    });
    
    const dismissBtn = wrapper.find(".fab-btn.danger");
    expect(dismissBtn.classes()).not.toContain("compact");
  });
});
