import { describe, it, expect, vi, beforeEach } from "vitest";
import { useDeepLinkHandler } from "../useDeepLinkHandler";
import { nextTick } from "vue";

const mockRoute = {
  query: { pin: undefined as string | undefined }
};

vi.mock("vue-router", () => ({
  useRoute: () => mockRoute
}));

describe("useDeepLinkHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRoute.query.pin = undefined;
    document.body.innerHTML = "";
  });

  it("toggleExpand adds/removes IDs from set", () => {
    const { expandedIds, toggleExpand } = useDeepLinkHandler("p-");
    toggleExpand("p1");
    expect(expandedIds.value.has("p1")).toBe(true);
    toggleExpand("p1");
    expect(expandedIds.value.has("p1")).toBe(false);
  });

  it("processDeepLink expands item if pin matches", () => {
    mockRoute.query.pin = "p1";
    const { expandedIds, processDeepLink } = useDeepLinkHandler("item-");
    const items = [{ id: "p1" }, { id: "p2" }];
    processDeepLink(items);
    expect(expandedIds.value.has("p1")).toBe(true);
  });

  it("processDeepLink does nothing if pin does not match", () => {
    mockRoute.query.pin = "p3";
    const { expandedIds, processDeepLink } = useDeepLinkHandler("item-");
    const items = [{ id: "p1" }, { id: "p2" }];
    processDeepLink(items);
    expect(expandedIds.value.size).toBe(0);
  });

  it("processDeepLink only runs once", () => {
    mockRoute.query.pin = "p1";
    const { expandedIds, processDeepLink } = useDeepLinkHandler("item-");
    const items = [{ id: "p1" }, { id: "p2" }];
    processDeepLink(items);
    expect(expandedIds.value.has("p1")).toBe(true);

    // Try to trigger again with different pin
    mockRoute.query.pin = "p2";
    processDeepLink(items);
    expect(expandedIds.value.has("p2")).toBe(false);
  });

  it("scrolls to element if it exists", async () => {
    mockRoute.query.pin = "p1";
    const { processDeepLink } = useDeepLinkHandler("item-");

    const el = document.createElement("div");
    el.id = "item-p1";
    el.scrollIntoView = vi.fn();
    document.body.appendChild(el);

    processDeepLink([{ id: "p1" }]);
    await nextTick();

    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
  });
});
