import { describe, it, expect, vi, beforeEach } from "vitest";
import { useHaptics } from "../useHaptics";

describe("useHaptics", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", {
      vibrate: vi.fn(),
    });
    // Reset interaction state simulation if needed,
    // but useHaptics has a local hasInteracted flag.
    // We might need to trigger an interaction.
  });

  it("provides the medium haptic method", () => {
    const haptics = useHaptics();
    expect(haptics.medium).toBeDefined();
    expect(typeof haptics.medium).toBe("function");
  });

  it("triggers vibration on tap", () => {
    const haptics = useHaptics();

    // Simulate interaction to allow vibration
    window.dispatchEvent(new Event("click"));

    haptics.tap();
    expect(navigator.vibrate).toHaveBeenCalledWith(12);
  });

  it("triggers vibration on medium", () => {
    const haptics = useHaptics();

    // Simulate interaction
    window.dispatchEvent(new Event("click"));

    haptics.medium();
    expect(navigator.vibrate).toHaveBeenCalledWith(25);
  });
});
