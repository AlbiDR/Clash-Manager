// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
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
    expect(modules.ghostBenchmarking).toBe(true);
    expect(modules.sortExplanation).toBeDefined();
  });

  it("toggles boolean modules correctly", async () => {
    const { useAppSettings } = await import("../useAppSettings");
    const { modules, toggle } = useAppSettings();
    const initial = modules.blitzMode;
    toggle("blitzMode");
    expect(modules.blitzMode).toBe(!initial);
  });

  it("ignores toggle calls on non-boolean modules", async () => {
    const { useAppSettings } = await import("../useAppSettings");
    const { modules, toggle } = useAppSettings();
    const initialSpeed = modules.blitzSpeed;
    const initialThreshold = modules.notificationThreshold;

    toggle("blitzSpeed");
    toggle("notificationThreshold");

    expect(modules.blitzSpeed).toBe(initialSpeed);
    expect(modules.notificationThreshold).toBe(initialThreshold);
  });

  describe("Validation Boundary (Target B [1])", () => {
    it("hydrates state correctly from valid localStorage data", async () => {
      const validData = {
        blitzMode: true,
        blitzSpeed: "slow",
        notificationThreshold: 50,
      };
      localStorage.setItem("cm_modules_v2", JSON.stringify(validData));

      const { useAppSettings } = await import("../useAppSettings");
      const { modules, init } = useAppSettings();
      init();

      expect(modules.blitzMode).toBe(true);
      expect(modules.blitzSpeed).toBe("slow");
      expect(modules.notificationThreshold).toBe(50);
      expect(modules.sortExplanation).toBe(true); // Default preserved
    });

    it("falls back to defaults when localStorage contains malformed data", async () => {
      const malformedData = {
        blitzMode: "not a boolean",
        blitzSpeed: "ultra-fast", // Invalid speed value
        notificationThreshold: 999, // Invalid picklist value
      };
      localStorage.setItem("cm_modules_v2", JSON.stringify(malformedData));

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { useAppSettings } = await import("../useAppSettings");
      const { modules, init } = useAppSettings();
      init();

      expect(modules.blitzMode).toBe(true); // Default
      expect(modules.blitzSpeed).toBe("fast"); // Default
      expect(modules.ghostBenchmarking).toBe(true); // Default
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
      expect(modules.ghostBenchmarking).toBe(true); // Default applied by Valibot
      expect(modules.notificationThreshold).toBe(75); // Default applied by Valibot
      expect(modules.sortExplanation).toBe(true); // Default applied by Valibot
    });
  });

  describe("Initialization Idempotency & Edge Cases", () => {
    it("prevents redundant initialization when init is called multiple times", async () => {
      const { useAppSettings } = await import("../useAppSettings");
      const { init } = useAppSettings();

      const addEventListenerSpy = vi.spyOn(window, "addEventListener");

      init();
      const initialListenersCount = addEventListenerSpy.mock.calls.length;

      // Second call to init should short-circuit
      init();
      expect(addEventListenerSpy.mock.calls.length).toBe(initialListenersCount);

      addEventListenerSpy.mockRestore();
    });

    it("handles idb rejection gracefully during init", async () => {
      const { idb } = await import("../StorageService");
      vi.mocked(idb.set).mockRejectedValueOnce(new Error("IDB Error"));

      const { useAppSettings } = await import("../useAppSettings");
      const { init } = useAppSettings();

      expect(() => init()).not.toThrow();
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

    it("catches localStorage quota/persistence errors gracefully in watcher", async () => {
      const setItemSpy = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const { useAppSettings } = await import("../useAppSettings");
      const { modules } = useAppSettings(); // Call composable to ensure watcher is registered

      modules.blitzMode = false;

      await nextTick();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Modules] Failed to persist",
        expect.any(Error)
      );

      setItemSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it("handles idb rejection gracefully inside reactivity watcher", async () => {
      const { idb } = await import("../StorageService");
      vi.mocked(idb.set).mockRejectedValue(new Error("IDB Store Error"));

      const { useAppSettings } = await import("../useAppSettings");
      const { modules } = useAppSettings();

      modules.experimentalNotifications = true;

      // Should not cause unhandled promise rejection or throw
      await expect(nextTick()).resolves.not.toThrow();
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

    it("ignores storage events for other keys or empty/null newValue", async () => {
      const { useAppSettings } = await import("../useAppSettings");
      const { modules, init } = useAppSettings();
      init();

      const initialBlitzState = modules.blitzMode;

      // Other key event
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "other_key",
          newValue: JSON.stringify({ blitzMode: !initialBlitzState }),
        })
      );
      expect(modules.blitzMode).toBe(initialBlitzState);

      // Null newValue event for MODULES_KEY
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "cm_modules_v2",
          newValue: null,
        })
      );
      expect(modules.blitzMode).toBe(initialBlitzState);
    });

    it("handles malformed JSON in cross-tab storage events gracefully", async () => {
      const { useAppSettings } = await import("../useAppSettings");
      const { modules, init } = useAppSettings();
      init();

      const initialBlitzState = modules.blitzMode;

      // Dispatch malformed JSON storage event
      expect(() => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: "cm_modules_v2",
            newValue: "invalid{json",
          })
        );
      }).not.toThrow();

      expect(modules.blitzMode).toBe(initialBlitzState);
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
