import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import BaseCard from "../BaseCard.vue";
import { useCardMechanics } from "../../composables/useCardMechanics";

// Mock useCardMechanics
vi.mock("../../composables/useCardMechanics", () => ({
  useCardMechanics: vi.fn(),
}));

describe("BaseCard.vue", () => {
  const mockHandlers = {
    handleTap: vi.fn(),
    handleLongPress: vi.fn(),
    handleScoreClick: vi.fn(),
    handleExpandClick: vi.fn(),
  };

  const defaultProps = {
    id: "test-id",
    expanded: false,
    selected: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useCardMechanics as any).mockReturnValue(mockHandlers);
  });

  const mountBaseCard = (props = {}, slots = {}) => {
    return mount(BaseCard, {
      props: { ...defaultProps, ...props },
      slots,
      global: {
        directives: {
          tactile: vi.fn(),
        },
        stubs: {
          Icon: true,
        },
      },
    });
  };

  it("renders with basic props", () => {
    const wrapper = mountBaseCard();
    expect(wrapper.classes()).toContain("card");
    expect(wrapper.classes()).not.toContain("expanded");
    expect(wrapper.classes()).not.toContain("selected");
    expect(wrapper.classes()).not.toContain("tagged");
  });

  it("applies state-driven classes correctly", () => {
    const wrapper = mountBaseCard({
      expanded: true,
      selected: true,
      isTagged: true,
    });
    expect(wrapper.classes()).toContain("expanded");
    expect(wrapper.classes()).toContain("selected");
    expect(wrapper.classes()).toContain("tagged");
  });

  it("renders slots correctly", () => {
    const slots = {
      "identity-meta": '<div class="meta-slot">Meta</div>',
      "identity-name": '<div class="name-slot">Name</div>',
      "score-section": '<div class="score-slot">Score</div>',
      "expanded-content": '<div class="expanded-slot">Expanded</div>',
    };

    // Case 1: Not expanded
    let wrapper = mountBaseCard({}, slots);
    expect(wrapper.find(".meta-slot").exists()).toBe(true);
    expect(wrapper.find(".name-slot").exists()).toBe(true);
    expect(wrapper.find(".score-slot").exists()).toBe(true);
    expect(wrapper.find(".expanded-slot").exists()).toBe(false);

    // Case 2: Expanded
    wrapper = mountBaseCard({ expanded: true }, slots);
    expect(wrapper.find(".expanded-slot").exists()).toBe(true);
  });

  it("applies dynamic score style to stat-pod", () => {
    const score = 85;
    const wrapper = mountBaseCard({ score });
    const statPod = wrapper.find(".stat-pod");
    expect(statPod.attributes("style")).toContain("--score-pct: 85%");
  });

  it("applies toneClass to stat-pod", () => {
    const toneClass = "custom-tone";
    const wrapper = mountBaseCard({ toneClass });
    const statPod = wrapper.find(".stat-pod");
    expect(statPod.classes()).toContain("custom-tone");
  });

  describe("Interactions", () => {
    it("binds v-tactile correctly", () => {
      const tactileSpy = vi.fn();
      mount(BaseCard, {
        props: defaultProps,
        global: {
          directives: {
            tactile: tactileSpy,
          },
          stubs: { Icon: true },
        },
      });

      // The directive is called with the element and the binding object.
      // We check that the value passed to the directive contains the expected handlers.
      // Note: Vue 3 directive binding object might have different structure in VTU
      expect(tactileSpy).toHaveBeenCalled();
      const call = tactileSpy.mock.calls[0];
      expect(call[0]).toBeInstanceOf(HTMLElement);
      expect(call[1].value).toMatchObject({
        onTap: mockHandlers.handleTap,
        onLongPress: mockHandlers.handleLongPress,
      });
    });

    it("triggers handleScoreClick and emits score-click", async () => {
      const wrapper = mountBaseCard();
      const scoreSection = wrapper.find(".score-section");

      const mockEvent = { stopPropagation: vi.fn() };
      await scoreSection.trigger("click", mockEvent);

      expect(mockHandlers.handleScoreClick).toHaveBeenCalled();
      expect(wrapper.emitted("score-click")).toBeTruthy();
    });

    it("triggers internalExpandClick on expand button click", async () => {
      const wrapper = mountBaseCard();
      const expandBtn = wrapper.find(".expand-btn");

      await expandBtn.trigger("click");
      expect(mockHandlers.handleExpandClick).toHaveBeenCalled();
    });
  });
});
