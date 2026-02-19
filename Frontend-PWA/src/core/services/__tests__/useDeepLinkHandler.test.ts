import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { nextTick } from "vue";
import { useDeepLinkHandler } from "../useDeepLinkHandler";

// 1. Mock vue-router
const mockRoute = {
  query: { pin: undefined as string | undefined },
};

vi.mock("vue-router", () => ({
  useRoute: () => mockRoute,
}));

describe("useDeepLinkHandler", () => {
  const domIdPrefix = "test-item-";

  beforeEach(() => {
    // Reset the mock route before each test
    mockRoute.query.pin = undefined;

    // Mock document.getElementById
    vi.stubGlobal("document", {
      getElementById: vi.fn(),
    });

    // Reset modules to ensure the 'deepLinkHandled' state is fresh if needed
    // (though it's inside the function, so it should be fine if we re-call the composable)
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("should initialize with an empty set of expanded IDs", () => {
    const { expandedIds } = useDeepLinkHandler(domIdPrefix);
    expect(expandedIds.value.size).toBe(0);
  });

  it("should toggle expansion state of an ID", () => {
    const { expandedIds, toggleExpand } = useDeepLinkHandler(domIdPrefix);

    toggleExpand("id1");
    expect(expandedIds.value.has("id1")).toBe(true);

    toggleExpand("id1");
    expect(expandedIds.value.has("id1")).toBe(false);
  });

  it("should correctly process a deep link when ID exists in data", async () => {
    mockRoute.query.pin = "id123";
    const items = [{ id: "id123" }, { id: "id456" }];
    const { expandedIds, processDeepLink } = useDeepLinkHandler(domIdPrefix);

    const mockElement = {
      scrollIntoView: vi.fn(),
    };
    (document.getElementById as any).mockReturnValue(mockElement);

    processDeepLink(items);

    expect(expandedIds.value.has("id123")).toBe(true);

    // Wait for nextTick
    await nextTick();

    expect(document.getElementById).toHaveBeenCalledWith(`${domIdPrefix}id123`);
    expect(mockElement.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
  });

  it("should NOT process deep link if ID is missing from data", async () => {
    mockRoute.query.pin = "missing-id";
    const items = [{ id: "id123" }];
    const { expandedIds, processDeepLink } = useDeepLinkHandler(domIdPrefix);

    processDeepLink(items);

    expect(expandedIds.value.has("missing-id")).toBe(false);
    expect(expandedIds.value.size).toBe(0);

    await nextTick();
    expect(document.getElementById).not.toHaveBeenCalled();
  });

  it("should NOT process deep link if pin query param is missing", async () => {
    mockRoute.query.pin = undefined;
    const items = [{ id: "id123" }];
    const { expandedIds, processDeepLink } = useDeepLinkHandler(domIdPrefix);

    processDeepLink(items);

    expect(expandedIds.value.size).toBe(0);
  });

  it("should only process deep link once to prevent recurring jumps", async () => {
    mockRoute.query.pin = "id1";
    const { processDeepLink, expandedIds } = useDeepLinkHandler(domIdPrefix);

    const mockElement = { scrollIntoView: vi.fn() };
    (document.getElementById as any).mockReturnValue(mockElement);

    // First call
    processDeepLink([{ id: "id1" }]);
    expect(expandedIds.value.has("id1")).toBe(true);

    // Second call with different data/ID should be ignored
    mockRoute.query.pin = "id2";
    processDeepLink([{ id: "id1" }, { id: "id2" }]);

    expect(expandedIds.value.has("id2")).toBe(false);

    await nextTick();
    expect(document.getElementById).toHaveBeenCalledTimes(1);
    expect(document.getElementById).toHaveBeenCalledWith(`${domIdPrefix}id1`);
  });

  it("should handle missing element in DOM gracefully", async () => {
    mockRoute.query.pin = "id1";
    const { processDeepLink } = useDeepLinkHandler(domIdPrefix);

    (document.getElementById as any).mockReturnValue(null);

    // Should not throw
    processDeepLink([{ id: "id1" }]);

    await nextTick();
    expect(document.getElementById).toHaveBeenCalled();
  });
});
