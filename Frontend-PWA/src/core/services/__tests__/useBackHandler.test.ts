import { describe, it, expect, vi, beforeEach } from "vitest";
import { useBackHandler } from "../useBackHandler";

/**
 * 🧪 USE BACK HANDLER TEST
 * Verifies that the back handler service correctly interacts with the
 * Browser History API and window events to intercept back navigation.
 */

describe("useBackHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock history.pushState to avoid actual navigation
    vi.spyOn(window.history, "pushState").mockImplementation(() => {});
    // Spy on window listeners
    vi.spyOn(window, "addEventListener");
    vi.spyOn(window, "removeEventListener");
  });

  it("should register popstate listener and push state to history", () => {
    const onClose = vi.fn();
    const { register } = useBackHandler(onClose);

    register();

    // Verify history state was pushed
    expect(window.history.pushState).toHaveBeenCalledTimes(1);
    const [state] = (window.history.pushState as any).mock.calls[0];
    expect(state).toHaveProperty("modalOpen");
    expect(typeof state.modalOpen).toBe("string");

    // Verify event listener was added
    expect(window.addEventListener).toHaveBeenCalledWith("popstate", expect.any(Function));
  });

  it("should call onClose when popstate event is triggered", () => {
    const onClose = vi.fn();
    const { register } = useBackHandler(onClose);

    register();

    // Extract the handler passed to addEventListener
    const popstateCall = (window.addEventListener as any).mock.calls.find(
      (call: any) => call[0] === "popstate"
    );
    const handler = popstateCall[1];

    // Simulate popstate event
    handler();

    expect(onClose).toHaveBeenCalled();
  });

  it("should remove popstate listener when unregistering", () => {
    const onClose = vi.fn();
    const { register, unregister } = useBackHandler(onClose);

    register();
    unregister();

    // Verify event listener was removed
    expect(window.removeEventListener).toHaveBeenCalledWith("popstate", expect.any(Function));
  });

  it("should handle multiple calls to register by pushing multiple states", () => {
    const onClose = vi.fn();
    const { register } = useBackHandler(onClose);

    register();
    register();

    expect(window.history.pushState).toHaveBeenCalledTimes(2);
    expect(window.addEventListener).toHaveBeenCalledTimes(2);
  });
});
