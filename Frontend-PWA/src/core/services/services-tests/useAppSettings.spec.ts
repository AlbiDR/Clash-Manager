import { describe, it, expect, beforeEach, vi } from "vitest";
import { nextTick } from "vue";
import { idb } from "../StorageService";

// Mock the storage service to verify side-effects
vi.mock("../StorageService", () => ({
  idb: {
    set: vi.fn(() => Promise.resolve()),
    get: vi.fn(),
  },
}));

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

  describe("Side Effects & Synchronization", () => {
    it("performs initial synchronization to IndexedDB on init", async () => {
      const { useAppSettings } = await import("../useAppSettings");
      const { init } = useAppSettings();
      init();

      expect(idb.set).toHaveBeenCalledWith("cm_notifications_enabled", expect.any(Boolean));
      expect(idb.set).toHaveBeenCalledWith("cm_notification_threshold", expect.any(Number));
    });

    it("synchronizes to localStorage and idb when modules change (watch effect)", async () => {
      const { useAppSettings } = await import("../useAppSettings");
      const { modules } = useAppSettings();

      // Trigger a change
      modules.experimentalNotifications = true;
      modules.notificationThreshold = 50;

      await nextTick();

      // Verify localStorage
      const stored = JSON.parse(localStorage.getItem("cm_modules_v2") || "{}");
      expect(stored.experimentalNotifications).toBe(true);
      expect(stored.notificationThreshold).toBe(50);

      // Verify idb sync
      expect(idb.set).toHaveBeenCalledWith("cm_notifications_enabled", true);
      expect(idb.set).toHaveBeenCalledWith("cm_notification_threshold", 50);
    });

    it("updates state when storage event is triggered (cross-tab sync)", async () => {
      const { useAppSettings } = await import("../useAppSettings");
      const { modules, init } = useAppSettings();
      init();

      const newData = {
        blitzMode: true,
        sortExplanation: false,
      };

      // Simulate storage event from another tab
      const event = new StorageEvent("storage", {
        key: "cm_modules_v2",
        newValue: JSON.stringify(newData),
      });
      window.dispatchEvent(event);

      expect(modules.blitzMode).toBe(true);
      expect(modules.sortExplanation).toBe(false);
    });
  });

  describe("Robustness", () => {
    it("handles JSON parse errors in localStorage gracefully", async () => {
      localStorage.setItem("cm_modules_v2", "invalid-json{");

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { useAppSettings } = await import("../useAppSettings");
      const { modules, init } = useAppSettings();

      // Should not throw
      expect(() => init()).not.toThrow();

      // Should remain with default state (or at least valid state)
      expect(modules.sortExplanation).toBe(true);

      consoleSpy.mockRestore();
    });
  });
});
