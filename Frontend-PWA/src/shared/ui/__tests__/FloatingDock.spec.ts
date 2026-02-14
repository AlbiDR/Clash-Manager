/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import FloatingDock from "../FloatingDock.vue";
import { ref } from "vue";

// Mock router
vi.mock("vue-router", () => ({
  useRoute: () => ({ path: "/" }),
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock services with deep paths
const mockTap = vi.fn();
vi.mock("@core/services/useHaptics", () => ({
  useHaptics: () => ({ tap: mockTap }),
}));

const mockDockVisible = ref(true);
const mockFabState = ref({
  selectionCount: 0,
  isBlasting: false,
  label: "Action",
  blitzEnabled: false,
  onAction: vi.fn(),
  onDismiss: vi.fn(),
});

vi.mock("@core/services/useUiCoordinator", () => ({
  useUiCoordinator: () => ({
    dockVisible: mockDockVisible,
    fabState: mockFabState.value, // It's not a ref in the source, it's a reactive object or plain object from the composable
  }),
}));

describe("FloatingDock.vue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDockVisible.value = true;
    mockFabState.value = {
      selectionCount: 0,
      isBlasting: false,
      label: "Action",
      blitzEnabled: false,
      onAction: vi.fn(),
      onDismiss: vi.fn(),
    };
    
    // Resize mock
    vi.stubGlobal('innerWidth', 1200);
  });

  const mountDock = () => {
    return mount(FloatingDock, {
      global: {
        directives: {
          tooltip: () => {}
        },
        stubs: {
          Icon: true
        }
      }
    });
  };

  it("renders navigation items when dock is visible", () => {
    const wrapper = mountDock();
    expect(wrapper.findAll(".dock-item").length).toBeGreaterThan(0);
  });

  it("shows dismiss button as compact when items are selected", async () => {
    mockDockVisible.value = false;
    mockFabState.value.selectionCount = 5;

    const wrapper = mountDock();
    
    const dismissBtn = wrapper.find(".fab-btn.danger");
    expect(dismissBtn.classes()).toContain("compact");
  });

  it("shows dismiss button as non-compact when nothing is selected and not blasting", async () => {
    mockDockVisible.value = false;
    mockFabState.value.selectionCount = 0;
    mockFabState.value.isBlasting = false;

    const wrapper = mountDock();
    
    const dismissBtn = wrapper.find(".fab-btn.danger");
    expect(dismissBtn.classes()).not.toContain("compact");
  });
});
