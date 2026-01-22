import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSystemRecovery } from "../useSystemRecovery";

// Create manual mocks to ensure we are testing the same instance
const mockToast = {
  info: vi.fn(() => "test-id"),
  success: vi.fn(),
  error: vi.fn(),
  remove: vi.fn(),
};

const mockHaptics = {
  medium: vi.fn(),
  heavy: vi.fn(),
};

const mockTheme = {
  clearManifestCache: vi.fn(),
};

const mockUpdateServiceWorker = vi.fn();

vi.mock("virtual:pwa-register/vue", () => ({
  useRegisterSW: vi.fn(() => ({
    updateServiceWorker: mockUpdateServiceWorker,
  })),
}));

vi.mock("../useToast", () => ({
  useToast: vi.fn(() => mockToast),
}));

vi.mock("../useHaptics", () => ({
  useHaptics: vi.fn(() => mockHaptics),
}));

vi.mock("../useTheme", () => ({
  useTheme: vi.fn(() => mockTheme),
}));

vi.mock("../../utils/idb", () => ({
  idb: {
    clear: vi.fn(),
  },
}));

describe("useSystemRecovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.location.reload
    vi.stubGlobal("location", { reload: vi.fn() });
    // Mock confirm
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  describe("forceUpdate", () => {
    it("should handle missing service worker support", async () => {
      vi.stubGlobal("navigator", {});
      const { forceUpdate } = useSystemRecovery();
      await forceUpdate();

      expect(mockToast.error).toHaveBeenCalledWith("Service Worker not available");
    });

    it("should handle update check with active registration", async () => {
      const mockUpdate = vi.fn();
      const mockReg = { update: mockUpdate, waiting: null, installing: null };
      vi.stubGlobal("navigator", {
        serviceWorker: {
          getRegistration: vi.fn().mockResolvedValue(mockReg),
        },
      });

      const { forceUpdate } = useSystemRecovery();
      await forceUpdate();

      expect(mockUpdate).toHaveBeenCalled();
      expect(mockToast.success).toHaveBeenCalledWith("Clash Manager is up to date");
    });
  });

  describe("clearCache", () => {
    it("should unregister service workers and clear caches", async () => {
      const mockUnregister = vi.fn();
      vi.stubGlobal("navigator", {
        serviceWorker: {
          getRegistrations: vi.fn().mockResolvedValue([{ unregister: mockUnregister }]),
        },
      });
      vi.stubGlobal("caches", {
        keys: vi.fn().mockResolvedValue(["cache1"]),
        delete: vi.fn().mockResolvedValue(true),
      });

      const { clearCache } = useSystemRecovery();
      await clearCache();

      expect(mockUnregister).toHaveBeenCalled();
      expect(window.location.reload).toHaveBeenCalled();
    });
  });

  describe("factoryReset", () => {
    it("should clear storages and indexedDB", async () => {
      vi.stubGlobal("localStorage", { clear: vi.fn() });
      vi.stubGlobal("sessionStorage", { clear: vi.fn() });
      const { idb } = await import("../../utils/idb");

      const { factoryReset } = useSystemRecovery();
      await factoryReset();

      expect(localStorage.clear).toHaveBeenCalled();
      expect(sessionStorage.clear).toHaveBeenCalled();
      expect(idb.clear).toHaveBeenCalled();
      expect(window.location.reload).toHaveBeenCalled();
    });
  });
});
