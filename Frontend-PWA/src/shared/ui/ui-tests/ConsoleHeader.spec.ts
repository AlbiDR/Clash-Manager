import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import ConsoleHeader from "../ConsoleHeader.vue";
import Icon from "../Icon.vue";
import StatusPill from "../StatusPill.vue";
import HeaderInfoOverlay from "../HeaderInfoOverlay.vue";
import { ref } from "vue";

// Expose the mock ref to control it in tests
const isScrolledMock = ref(false);

// Mock dependencies using deep imports to avoid side effects from barrels
vi.mock("../../../core/services/useHaptics", () => ({
  useHaptics: () => ({
    tap: vi.fn(),
  }),
}));

vi.mock("../../composables/useHeaderScroll", () => ({
  useHeaderScroll: () => ({
    isScrolled: isScrolledMock,
  }),
}));

vi.mock("../../../core/services/useAppSettings", () => ({
  useAppSettings: () => ({
    modules: {
      sortExplanation: true,
    },
  }),
}));

describe("ConsoleHeader.vue", () => {
  const defaultProps = {
    title: "Test Title",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    isScrolledMock.value = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the title correctly", () => {
    const wrapper = mount(ConsoleHeader, {
      props: defaultProps,
      global: {
        components: { Icon, StatusPill, HeaderInfoOverlay },
      },
    });
    expect(wrapper.find(".view-title").text()).toBe("Test Title");
  });

  it("renders the title as a link when sheetUrl is provided", () => {
    const wrapper = mount(ConsoleHeader, {
      props: {
        ...defaultProps,
        sheetUrl: "https://example.com",
      },
      global: {
        components: { Icon, StatusPill, HeaderInfoOverlay },
      },
    });
    const link = wrapper.find("a.title-link");
    expect(link.exists()).toBe(true);
    expect(link.attributes("href")).toBe("https://example.com");
  });

  it("renders stats when provided and not loading", () => {
    const wrapper = mount(ConsoleHeader, {
      props: {
        ...defaultProps,
        stats: { label: "MEMBERS", value: "50/50" },
        loading: false,
      },
      global: {
        components: { Icon, StatusPill, HeaderInfoOverlay },
      },
    });
    expect(wrapper.find(".stats-pill").exists()).toBe(true);
    expect(wrapper.find(".sp-value").text()).toBe("50/50");
    expect(wrapper.find(".sp-label").text()).toBe("MEMBERS");
  });

  it("renders StatusPill when provided and not loading", () => {
    const wrapper = mount(ConsoleHeader, {
      props: {
        ...defaultProps,
        status: { type: "ready", text: "Connected" },
        loading: false,
      },
      global: {
        components: { Icon, StatusPill, HeaderInfoOverlay },
      },
    });
    expect(wrapper.findComponent({ name: "StatusPill" }).exists()).toBe(true);
  });

  it("emits update:search with debounce after input", async () => {
    const wrapper = mount(ConsoleHeader, {
      props: {
        ...defaultProps,
        showSearch: true,
      },
      global: {
        components: { Icon, StatusPill, HeaderInfoOverlay },
      },
    });
    const input = wrapper.find("input.glass-input");
    await input.setValue("test search");

    // Should not emit immediately
    expect(wrapper.emitted("update:search")).toBeUndefined();

    // Fast-forward time
    vi.advanceTimersByTime(300);

    expect(wrapper.emitted("update:search")).toBeTruthy();
    expect(wrapper.emitted("update:search")![0]).toEqual(["test search"]);
  });

  it("emits update:sort when selection changes", async () => {
    const sortOptions = [
      { label: "Name", value: "name" },
      { label: "Score", value: "score" },
    ];
    const wrapper = mount(ConsoleHeader, {
      props: {
        ...defaultProps,
        showSearch: true,
        sortOptions,
        currentSort: "name",
      },
      global: {
        components: { Icon, StatusPill, HeaderInfoOverlay },
      },
    });
    const select = wrapper.find("select.glass-select");
    await select.setValue("score");

    expect(wrapper.emitted("update:sort")).toBeTruthy();
    expect(wrapper.emitted("update:sort")![0]).toEqual(["score"]);
  });

  it("renders skeletons when loading", () => {
    const wrapper = mount(ConsoleHeader, {
      props: {
        ...defaultProps,
        loading: true,
        showSearch: true,
      },
      global: {
        components: { Icon, StatusPill, HeaderInfoOverlay },
      },
    });
    expect(wrapper.find(".sk-badge-m").exists()).toBe(true);
    expect(wrapper.find(".sk-pill").exists()).toBe(true);
    expect(wrapper.find(".sk-input").exists()).toBe(true);
    expect(wrapper.find(".sk-select").exists()).toBe(true);

    // Content should be hidden
    expect(wrapper.find(".stats-pill").exists()).toBe(false);
    expect(wrapper.findComponent({ name: "StatusPill" }).exists()).toBe(false);
    expect(wrapper.find("input.glass-input").exists()).toBe(false);
    expect(wrapper.find("select.glass-select").exists()).toBe(false);
  });

  it("applies is-scrolled class based on useHeaderScroll", async () => {
    const wrapper = mount(ConsoleHeader, {
      props: defaultProps,
      global: {
        components: { Icon, StatusPill, HeaderInfoOverlay },
      },
    });

    expect(wrapper.find(".header-wrapper").classes()).not.toContain("is-scrolled");

    isScrolledMock.value = true;
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".header-wrapper").classes()).toContain("is-scrolled");
  });

  it("renders extra slot content", () => {
    const wrapper = mount(ConsoleHeader, {
      props: {
        ...defaultProps,
        reserveExtraSpace: true,
      },
      slots: {
        extra: '<div class="extra-content">Slot Content</div>',
      },
      global: {
        components: { Icon, StatusPill, HeaderInfoOverlay },
      },
    });
    expect(wrapper.find(".header-row.extra").exists()).toBe(true);
    expect(wrapper.find(".extra-content").text()).toBe("Slot Content");
  });

  it("opens info overlay when sort info button is clicked", async () => {
    const sortOptions = [
      { label: "Name", value: "name", desc: "Sort by name" },
    ];
    const wrapper = mount(ConsoleHeader, {
      props: {
        ...defaultProps,
        showSearch: true,
        sortOptions,
        currentSort: "name",
      },
      global: {
        components: { Icon, StatusPill, HeaderInfoOverlay },
      },
    });

    const infoBtn = wrapper.find(".info-dot-inline");
    expect(infoBtn.exists()).toBe(true);

    await infoBtn.trigger("click");

    const overlay = wrapper.findComponent({ name: "HeaderInfoOverlay" });
    expect(overlay.props("show")).toBe(true);
    expect(overlay.props("content")).toBe("Sort by name");
  });
});
