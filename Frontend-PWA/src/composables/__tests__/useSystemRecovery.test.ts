import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSystemRecovery } from "../useSystemRecovery";

// Mock dependencies
const mockUpdateServiceWorker = vi.fn();
vi.mock("virtual:pwa-register/vue", () => ({
  useRegisterSW: () => ({
    updateServiceWorker: mockUpdateServiceWorker,
  }),
}));

const mockToast = {
  info: vi.fn(() => "tid"),
  success: vi.fn(),
  error: vi.fn(),
  remove: vi.fn(),
};
vi.mock("../useToast", () => ({
  useToast: () => mockToast,
}));

const mockHaptics = {
  heavy: vi.fn(),
  medium: vi.fn(),
  tap: vi.fn(),
};
vi.mock("../useHaptics", () => ({
  useHaptics: () => mockHaptics,
}));

const mockClearManifestCache = vi.fn();
vi.mock("../useTheme", () => ({
  useTheme: () => ({
    clearManifestCache: mockClearManifestCache,
  }),
}));

vi.mock("../../utils/idb", () => ({
  idb: {
    clear: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("useSystemRecovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup global mocks
    global.confirm = vi.fn(() => true);

    // Mock window.location.reload
    const locationReload = vi.fn();
    // @ts-ignore
    delete window.location;
    // @ts-ignore
    window.location = { reload: locationReload };

    // Mock navigator.serviceWorker
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        getRegistration: vi.fn(),
        getRegistrations: vi.fn().mockResolvedValue([]),
      },
      configurable: true,
      writable: true
    });

    // Mock caches
    // @ts-ignore
    global.caches = {
      keys: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(true),
    };
  });

  describe("forceUpdate", () => {
    it("handles case when service worker is not available", async () => {
      // @ts-ignore
      delete navigator.serviceWorker;
      const { forceUpdate } = useSystemRecovery();
      await forceUpdate();
      expect(mockToast.error).toHaveBeenCalledWith("Service Worker not available");
    });

    it("handles case when no registration is found", async () => {
      // @ts-ignore
      vi.mocked(navigator.serviceWorker.getRegistration).mockResolvedValue(null);
      const { forceUpdate } = useSystemRecovery();
      await forceUpdate();
      expect(mockToast.error).toHaveBeenCalledWith("No active session found");
    });

    it("triggers update if waiting", async () => {
      const mockReg = { waiting: true };
      // @ts-ignore
      vi.mocked(navigator.serviceWorker.getRegistration).mockResolvedValue(mockReg);
      const { forceUpdate } = useSystemRecovery();
      await forceUpdate();
      expect(mockUpdateServiceWorker).toHaveBeenCalledWith(true);
      expect(mockToast.success).toHaveBeenCalledWith("Update ready! Reloading...");
    });
  });

  describe("clearCache", () => {
    it("calls clearManifestCache and reloads on confirm", async () => {
      const { clearCache } = useSystemRecovery();
      await clearCache();
      expect(mockClearManifestCache).toHaveBeenCalled();
      expect(window.location.reload).toHaveBeenCalled();
    });

    it("does nothing if confirm is cancelled", async () => {
      // @ts-ignore
      global.confirm.mockReturnValue(false);
      const { clearCache } = useSystemRecovery();
      await clearCache();
      expect(mockClearManifestCache).not.toHaveBeenCalled();
      expect(window.location.reload).not.toHaveBeenCalled();
    });
  });

  describe("factoryReset", () => {
    it("clears storage and IDB on confirm", async () => {
      const spyLocalStorage = vi.spyOn(Storage.prototype, "clear");
      const { factoryReset } = useSystemRecovery();
      await factoryReset();
      expect(spyLocalStorage).toHaveBeenCalled();
      expect(window.location.reload).toHaveBeenCalled();
    });
  });
});
