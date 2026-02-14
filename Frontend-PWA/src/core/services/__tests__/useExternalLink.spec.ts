import { useExternalLink } from "@core";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// Mock the toast composable
const mockError = vi.fn();
vi.mock("../useToast", () => ({
  useToast: () => ({
    error: mockError,
  }),
}));

describe("useExternalLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset window Properties
    vi.stubGlobal("window", {
      open: vi.fn(() => ({})), // Mock successful window.open
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses standard window.open", async () => {
    const { openExternal } = useExternalLink();
    await openExternal("https://example.com");

    expect(window.open).toHaveBeenCalledWith(
      "https://example.com",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("handles popup blockers in standard web mode", async () => {
    // Mock window.open returning null (blocked)
    vi.stubGlobal("window", {
      open: vi.fn(() => null),
    });
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { openExternal } = useExternalLink();
    await openExternal("https://example.com");

    expect(consoleSpy).toHaveBeenCalledWith(
      "External link blocked or failed to open",
    );
  });

  it("handles errors gracefully", async () => {
    // Force an error
    vi.stubGlobal("window", {
      open: vi.fn(() => {
        throw new Error("Blocked");
      }),
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { openExternal } = useExternalLink();
    await openExternal("https://example.com");

    expect(mockError).toHaveBeenCalledWith("Could not open link");
    expect(consoleSpy).toHaveBeenCalled();
  });
});
