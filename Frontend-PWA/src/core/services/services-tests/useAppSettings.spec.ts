import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * [TEST] useAppSettings
 *
 * This test verifies the public interface of the composable and validates
 * the internal schema boundary logic by interacting with the actual implementation
 * through dynamic imports to reset the module singleton.
 */

describe("useAppSettings", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("exports modules as a reactive object (not a Ref)", async () => {
    const { useAppSettings } = await import("../useAppSettings");
    const { modules } = useAppSettings();
    expect((modules as any).value).toBeUndefined();
    expect(modules.sortExplanation).toBeDefined();
  });

  it("toggles boolean modules correctly", async () => {
    const { useAppSettings } = await import("../useAppSettings");
    const { modules, toggle } = useAppSettings();
    const initial = modules.blitzMode;
    toggle("blitzMode");
    expect(modules.blitzMode).toBe(!initial);
  });

  describe("Validation Boundary (Target B [1])", () => {
    it("hydrates state correctly from valid localStorage data", async () => {
      const validData = {
        blitzMode: true,
        notificationThreshold: 50,
      };
      localStorage.setItem("cm_modules_v2", JSON.stringify(validData));

      const { useAppSettings } = await import("../useAppSettings");
      const { modules, init } = useAppSettings();
      init();

      expect(modules.blitzMode).toBe(true);
      expect(modules.notificationThreshold).toBe(50);
      expect(modules.sortExplanation).toBe(true); // Default preserved
    });

    it("falls back to defaults when localStorage contains malformed data", async () => {
      const malformedData = {
        blitzMode: "not a boolean",
        notificationThreshold: 999, // Invalid picklist value
      };
      localStorage.setItem("cm_modules_v2", JSON.stringify(malformedData));

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { useAppSettings } = await import("../useAppSettings");
      const { modules, init } = useAppSettings();
      init();

      expect(modules.blitzMode).toBe(false); // Default
      expect(modules.notificationThreshold).toBe(75); // Default
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[Modules] Storage validation failed"),
        expect.any(Array)
      );
      consoleSpy.mockRestore();
    });

    it("handles missing fields by applying schema defaults", async () => {
      const partialData = {
        blitzMode: true,
      };
      localStorage.setItem("cm_modules_v2", JSON.stringify(partialData));

      const { useAppSettings } = await import("../useAppSettings");
      const { modules, init } = useAppSettings();
      init();

      expect(modules.blitzMode).toBe(true);
      expect(modules.notificationThreshold).toBe(75); // Default applied by Valibot
      expect(modules.sortExplanation).toBe(true); // Default applied by Valibot
    });
  });
});
