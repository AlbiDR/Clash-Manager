import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useDeepLinkHandler } from "../useDeepLinkHandler";
import { nextTick } from "vue";

/**
 * 🛡️ VERIFICATION: useDeepLinkHandler
 * Target B [1]: Logic and regression prevention for deep linking and auto-scroll.
 */

// Mock vue-router
const mockRoute = {
  query: {}
};
vi.mock("vue-router", () => ({
  useRoute: () => mockRoute
}));

describe("useDeepLinkHandler", () => {
  const domIdPrefix = "test-";
  const items = [
    { id: "123" },
    { id: "456" }
  ];

  beforeEach(() => {
    mockRoute.query = {};
    vi.clearAllMocks();

    // Mock document.getElementById
    vi.stubGlobal("document", {
      getElementById: vi.fn()
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should initialize with empty expandedIds", () => {
    const { expandedIds } = useDeepLinkHandler(domIdPrefix);
    expect(expandedIds.value.size).toBe(0);
  });

  it("should toggle expansion", () => {
    const { expandedIds, toggleExpand } = useDeepLinkHandler(domIdPrefix);

    toggleExpand("123");
    expect(expandedIds.value.has("123")).toBe(true);

    toggleExpand("123");
    expect(expandedIds.value.has("123")).toBe(false);
  });

  it("should process deep link and expand item if pin exists in items", async () => {
    mockRoute.query = { pin: "123" };
    const { expandedIds, processDeepLink } = useDeepLinkHandler(domIdPrefix);

    const mockScrollIntoView = vi.fn();
    const mockElement = { scrollIntoView: mockScrollIntoView };
    (document.getElementById as any).mockReturnValue(mockElement);

    processDeepLink(items);

    expect(expandedIds.value.has("123")).toBe(true);

    await nextTick();

    expect(document.getElementById).toHaveBeenCalledWith("test-123");
    expect(mockScrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
  });

  it("should not expand or scroll if pin is missing from query", async () => {
    const { expandedIds, processDeepLink } = useDeepLinkHandler(domIdPrefix);

    processDeepLink(items);

    expect(expandedIds.value.size).toBe(0);
    expect(document.getElementById).not.toHaveBeenCalled();
  });

  it("should not expand or scroll if pinned item is not in the provided items list", async () => {
    mockRoute.query = { pin: "999" };
    const { expandedIds, processDeepLink } = useDeepLinkHandler(domIdPrefix);

    processDeepLink(items);

    expect(expandedIds.value.has("999")).toBe(false);
    expect(document.getElementById).not.toHaveBeenCalled();
  });

  it("should only handle deep link once even if pin changes", async () => {
    mockRoute.query = { pin: "123" };
    const { processDeepLink, expandedIds } = useDeepLinkHandler(domIdPrefix);

    const mockScrollIntoView = vi.fn();
    const mockElement = { scrollIntoView: mockScrollIntoView };
    (document.getElementById as any).mockReturnValue(mockElement);

    // First call
    processDeepLink(items);
    expect(expandedIds.value.has("123")).toBe(true);

    await nextTick();
    expect(document.getElementById).toHaveBeenCalledWith("test-123");

    // Change the pin in the query
    mockRoute.query = { pin: "456" };
    vi.clearAllMocks();
    (document.getElementById as any).mockReturnValue(mockElement);

    // Second call - should do nothing because deepLinkHandled is true
    processDeepLink(items);
    await nextTick();
    expect(expandedIds.value.has("456")).toBe(false);
    expect(document.getElementById).not.toHaveBeenCalled();
  });

  it("should handle empty items array gracefully", () => {
    mockRoute.query = { pin: "123" };
    const { expandedIds, processDeepLink } = useDeepLinkHandler(domIdPrefix);

    processDeepLink([]);

    expect(expandedIds.value.size).toBe(0);
    expect(document.getElementById).not.toHaveBeenCalled();
  });

  it("should handle missing element in DOM gracefully (Skeptic Path)", async () => {
    mockRoute.query = { pin: "123" };
    const { expandedIds, processDeepLink } = useDeepLinkHandler(domIdPrefix);

    // Element not found in DOM
    (document.getElementById as any).mockReturnValue(null);

    processDeepLink(items);

    expect(expandedIds.value.has("123")).toBe(true); // Should still expand

    await nextTick();

    expect(document.getElementById).toHaveBeenCalledWith("test-123");
    // Should not crash even if element is null
  });
});
