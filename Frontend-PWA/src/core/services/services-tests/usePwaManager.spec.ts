// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { usePwaManager } from "../usePwaManager";
import { useHaptics } from "../useHaptics";
import { useToast } from "../useToast";
import { idb } from "../StorageService";

const mockHaptics = {
  medium: vi.fn(),
  heavy: vi.fn(),
};

const mockToast = {
  info: vi.fn(() => "toast-id"),
  success: vi.fn(),
  error: vi.fn(),
  remove: vi.fn(),
};

vi.mock("../useHaptics", () => ({
  useHaptics: vi.fn(() => mockHaptics),
}));

vi.mock("../useToast", () => ({
  useToast: vi.fn(() => mockToast),
}));

vi.mock("../StorageService", () => ({
  idb: {
    destroyAll: vi.fn(),
    clear: vi.fn(),
  },
}));

describe("usePwaManager", () => {
  const mockReload = vi.fn();
  const mockConfirm = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("confirm", mockConfirm);
    vi.stubGlobal("location", { reload: mockReload });

    // Default navigator mock
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistration: vi.fn().mockResolvedValue(null),
        getRegistrations: vi.fn().mockResolvedValue([]),
      },
    });

    // Default caches mock
    vi.stubGlobal("caches", {
      keys: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(true),
    });

    // Default storage mocks
    vi.stubGlobal("localStorage", {
      clear: vi.fn(),
    });
    vi.stubGlobal("sessionStorage", {
      clear: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("forceUpdate", () => {
    it("should handle absence of Service Worker support", async () => {
      vi.stubGlobal("navigator", {});
      const { forceUpdate } = usePwaManager();

      await forceUpdate();

      expect(mockToast.error).toHaveBeenCalledWith("Service Worker not available");
    });

    it("should handle missing registrations", async () => {
      (navigator.serviceWorker.getRegistration as any).mockResolvedValue(null);
      const { forceUpdate } = usePwaManager();

      await forceUpdate();

      expect(mockToast.error).toHaveBeenCalledWith("No active session found");
    });

    it("should trigger immediate update if waiting worker exists", async () => {
      const mockRegistration = {
        waiting: true,
        update: vi.fn(),
      };
      (navigator.serviceWorker.getRegistration as any).mockResolvedValue(mockRegistration);

      const { forceUpdate, updateServiceWorker } = usePwaManager();
      const mockUpdateFn = vi.fn();
      updateServiceWorker.value = mockUpdateFn;

      await forceUpdate();

      expect(mockToast.success).toHaveBeenCalledWith("Update ready! Reloading...");
      expect(mockUpdateFn).toHaveBeenCalledWith(true);
    });

    it("should notify when no update is found", async () => {
      const mockRegistration = {
        waiting: false,
        update: vi.fn().mockResolvedValue(undefined),
      };
      (navigator.serviceWorker.getRegistration as any).mockResolvedValue(mockRegistration);

      const { forceUpdate } = usePwaManager();

      await forceUpdate();

      expect(mockToast.success).toHaveBeenCalledWith("Clash Manager is up to date");
    });

    it("should notify when an update is found and downloading", async () => {
      const mockRegistration = {
        waiting: false,
        update: vi.fn().mockImplementation(function(this: any) {
          this.installing = true;
          return Promise.resolve();
        }),
      };
      (navigator.serviceWorker.getRegistration as any).mockResolvedValue(mockRegistration);

      const { forceUpdate } = usePwaManager();

      await forceUpdate();

      expect(mockToast.success).toHaveBeenCalledWith("Update found! Downloading...");
    });

    it("should handle update check failures", async () => {
      (navigator.serviceWorker.getRegistration as any).mockRejectedValue(new Error("Update failed"));
      const { forceUpdate } = usePwaManager();

      await forceUpdate();

      expect(mockToast.error).toHaveBeenCalledWith("Update check failed");
    });
  });

  describe("clearCache", () => {
    it("should do nothing if user denies confirmation", async () => {
      mockConfirm.mockReturnValue(false);
      const { clearCache } = usePwaManager();

      await clearCache();

      expect(navigator.serviceWorker.getRegistrations).not.toHaveBeenCalled();
      expect(mockReload).not.toHaveBeenCalled();
    });

    it("should unregister SWs and delete caches on confirmation", async () => {
      mockConfirm.mockReturnValue(true);
      const mockSW = { unregister: vi.fn() };
      (navigator.serviceWorker.getRegistrations as any).mockResolvedValue([mockSW]);
      (caches.keys as any).mockResolvedValue(["cache-v1", "cache-v2"]);

      const onCleanup = vi.fn();
      const { clearCache } = usePwaManager();

      await clearCache(onCleanup);

      expect(mockSW.unregister).toHaveBeenCalled();
      expect(caches.delete).toHaveBeenCalledWith("cache-v1");
      expect(caches.delete).toHaveBeenCalledWith("cache-v2");
      expect(onCleanup).toHaveBeenCalled();
      expect(mockReload).toHaveBeenCalled();
    });
  });

  describe("factoryReset", () => {
    it("should do nothing if user denies confirmation", async () => {
      mockConfirm.mockReturnValue(false);
      const { factoryReset } = usePwaManager();

      await factoryReset();

      expect(localStorage.clear).not.toHaveBeenCalled();
      expect(mockReload).not.toHaveBeenCalled();
    });

    it("should perform deep cleanup and reload on confirmation", async () => {
      mockConfirm.mockReturnValue(true);
      const mockSW = { unregister: vi.fn() };
      (navigator.serviceWorker.getRegistrations as any).mockResolvedValue([mockSW]);
      (caches.keys as any).mockResolvedValue(["cache-v1"]);

      const onCleanup = vi.fn();
      const { factoryReset } = usePwaManager();

      await factoryReset(onCleanup);

      expect(mockSW.unregister).toHaveBeenCalled();
      expect(caches.delete).toHaveBeenCalledWith("cache-v1");
      expect(localStorage.clear).toHaveBeenCalled();
      expect(sessionStorage.clear).toHaveBeenCalled();
      expect(idb.destroyAll).toHaveBeenCalled();
      expect(onCleanup).toHaveBeenCalled();
      expect(mockReload).toHaveBeenCalled();
    });

    it("should fallback to idb.clear if destroyAll is unavailable", async () => {
      mockConfirm.mockReturnValue(true);
      (idb as any).destroyAll = undefined;

      const { factoryReset } = usePwaManager();
      await factoryReset();

      expect(idb.clear).toHaveBeenCalled();
    });
  });
});
