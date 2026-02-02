import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref } from "vue";
import { useSettings } from "../useSettings";

// --- Mocks ---

const mockToggle = vi.hoisted(() => vi.fn());
const mockInitAppSettings = vi.hoisted(() => vi.fn());
const mockSetTheme = vi.hoisted(() => vi.fn());
const mockClearManifestCache = vi.hoisted(() => vi.fn());
const mockHaptics = vi.hoisted(() => ({
  tap: vi.fn(),
  medium: vi.fn(),
  heavy: vi.fn(),
}));
const mockToggleSyntheticMode = vi.hoisted(() => vi.fn());
const mockToggleBlueprintMode = vi.hoisted(() => vi.fn());
const mockToggleShowcaseMode = vi.hoisted(() => vi.fn());
const mockRefresh = vi.hoisted(() => vi.fn());
const mockUpdateServiceWorker = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => ({
  info: vi.fn(() => "toast-id"),
  success: vi.fn(),
  error: vi.fn(),
  remove: vi.fn(),
}));
const mockIdb = vi.hoisted(() => ({
  clear: vi.fn().mockResolvedValue(undefined),
}));

const mockModules = { sortExplanation: true };
const theme = ref("auto");
const wakeLock = { isActive: ref(false) };
const isSyntheticMode = ref(false);
const isBlueprintMode = ref(false);
const isShowcaseMode = ref(false);
const isHydrated = ref(false);
const isRefreshing = ref(false);
const unifiedStatus = ref("online");

vi.mock("../useAppSettings", () => ({
  useAppSettings: () => ({ modules: mockModules, toggle: mockToggle, init: mockInitAppSettings }),
}));

vi.mock("../useTheme", () => ({
  useTheme: () => ({
    theme,
    setTheme: (val: string) => {
      theme.value = val;
      mockSetTheme(val);
    },
    clearManifestCache: mockClearManifestCache,
  }),
}));

vi.mock("../useHaptics", () => ({
  useHaptics: () => mockHaptics,
}));

vi.mock("../useWakeLock", () => ({
  useWakeLock: () => wakeLock,
}));

vi.mock("../useSyntheticMode", () => ({
  useSyntheticMode: () => ({ isSyntheticMode, toggleSyntheticMode: mockToggleSyntheticMode }),
}));

vi.mock("../useBlueprintMode", () => ({
  useBlueprintMode: () => ({ isBlueprintMode, toggleBlueprintMode: mockToggleBlueprintMode }),
}));

vi.mock("../useShowcaseMode", () => ({
  useShowcaseMode: () => ({ isShowcaseMode, toggleShowcaseMode: mockToggleShowcaseMode }),
}));

vi.mock("../useClashData", () => ({
  useClashData: () => ({ isHydrated, isRefreshing, refresh: mockRefresh }),
}));

vi.mock("../useConnectionStatus", () => ({
  useConnectionStatus: () => ({ status: unifiedStatus }),
}));

vi.mock("virtual:pwa-register/vue", () => ({
  useRegisterSW: () => ({ updateServiceWorker: mockUpdateServiceWorker }),
}));

vi.mock("../useToast", () => ({
  useToast: () => mockToast,
}));

vi.mock("../../utils/idb", () => ({
  idb: mockIdb,
}));

describe("useSettings", () => {
  const originalServiceWorker = navigator.serviceWorker;

  beforeEach(() => {
    vi.clearAllMocks();
    isSyntheticMode.value = false;
    isBlueprintMode.value = false;
    isShowcaseMode.value = false;
    unifiedStatus.value = "online";
    theme.value = "auto";

    // Mock navigator.serviceWorker
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      writable: true,
      value: {
        getRegistration: vi.fn(),
        getRegistrations: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
      },
    });

    // Mock globals using vi.stubGlobal for better cleanup
    vi.stubGlobal("caches", {
      keys: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(true),
    });

    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));

    // Mock sessionStorage
    const sessionStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      clear: vi.fn(),
      removeItem: vi.fn(),
      length: 0,
      key: vi.fn(),
    };
    vi.stubGlobal("sessionStorage", sessionStorageMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    // Restore original serviceWorker
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: originalServiceWorker,
    });
  });

  it("exports all required state and methods", () => {
    const settings = useSettings();
    expect(settings.modules).toBeDefined();
    expect(settings.theme).toBeDefined();
    expect(settings.handleThemeChange).toBeInstanceOf(Function);
    expect(settings.forceUpdate).toBeInstanceOf(Function);
    expect(settings.clearCache).toBeInstanceOf(Function);
    expect(settings.factoryReset).toBeInstanceOf(Function);
  });

  describe("footerBadgeText", () => {
    it("returns correct labels based on mode", () => {
      const { footerBadgeText } = useSettings();

      expect(footerBadgeText.value).toBe("");

      isShowcaseMode.value = true;
      expect(footerBadgeText.value).toBe("SHOWCASE");

      isShowcaseMode.value = false;
      isBlueprintMode.value = true;
      expect(footerBadgeText.value).toBe("BLUEPRINT");

      isBlueprintMode.value = false;
      isSyntheticMode.value = true;
      expect(footerBadgeText.value).toBe("SYNTHETIC");
    });
  });

  describe("apiStatusObject", () => {
    it("maps unifiedStatus to UI objects correctly", () => {
      const { apiStatusObject } = useSettings();

      unifiedStatus.value = "online";
      expect(apiStatusObject.value).toEqual({ type: "ready", text: "Systems Online" });

      unifiedStatus.value = "offline";
      expect(apiStatusObject.value).toEqual({ type: "error", text: "Disconnected" });

      unifiedStatus.value = "syncing";
      expect(apiStatusObject.value).toEqual({ type: "loading", text: "Syncing..." });

      unifiedStatus.value = "success-resolve";
      expect(apiStatusObject.value).toEqual({ type: "ready", text: "Verified" });

      unifiedStatus.value = "unknown";
      expect(apiStatusObject.value).toEqual({ type: "loading", text: "Connecting..." });
    });
  });

  it("handleThemeChange calls haptics and setTheme", () => {
    const { handleThemeChange } = useSettings();
    handleThemeChange("dark" as any);
    expect(mockHaptics.tap).toHaveBeenCalled();
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
    expect(theme.value).toBe("dark");
  });

  describe("forceUpdate", () => {
    it("handles missing serviceWorker", async () => {
      // @ts-ignore - Truly remove it for the check "serviceWorker" in navigator
      delete navigator.serviceWorker;
      const { forceUpdate } = useSettings();
      await forceUpdate();
      expect(mockToast.error).toHaveBeenCalledWith("Service Worker not available");
    });

    it("handles missing registration", async () => {
      (navigator.serviceWorker.getRegistration as any).mockResolvedValue(null);
      const { forceUpdate } = useSettings();
      await forceUpdate();
      expect(mockToast.error).toHaveBeenCalledWith("No active session found");
    });

    it("triggers direct update if reg.waiting is present", async () => {
      const mockReg = { waiting: true };
      (navigator.serviceWorker.getRegistration as any).mockResolvedValue(mockReg);
      const { forceUpdate } = useSettings();
      await forceUpdate();
      expect(mockUpdateServiceWorker).toHaveBeenCalledWith(true);
      expect(mockToast.success).toHaveBeenCalledWith("Update ready! Reloading...");
    });

    it("calls reg.update() and reports if update found", async () => {
      const mockReg = {
        update: vi.fn().mockResolvedValue(undefined),
        installing: true,
      };
      (navigator.serviceWorker.getRegistration as any).mockResolvedValue(mockReg);
      const { forceUpdate } = useSettings();
      await forceUpdate();
      expect(mockReg.update).toHaveBeenCalled();
      expect(mockToast.success).toHaveBeenCalledWith("Update found! Downloading...");
    });

    it("reports if already up to date", async () => {
      const mockReg = {
        update: vi.fn().mockResolvedValue(undefined),
        installing: false,
        waiting: false,
      };
      (navigator.serviceWorker.getRegistration as any).mockResolvedValue(mockReg);
      const { forceUpdate } = useSettings();
      await forceUpdate();
      expect(mockToast.success).toHaveBeenCalledWith("Clash Manager is up to date");
    });
  });

  describe("clearCache", () => {
    it("does nothing if user cancels", async () => {
      vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
      const { clearCache } = useSettings();
      await clearCache();
      expect(navigator.serviceWorker.getRegistrations).not.toHaveBeenCalled();
    });

    it("unregisters SWs and clears caches on confirm", async () => {
      const mockReg = { unregister: vi.fn() };
      (navigator.serviceWorker.getRegistrations as any).mockResolvedValue([mockReg]);

      // Setup caches to have some keys
      vi.stubGlobal("caches", {
        keys: vi.fn().mockResolvedValue(["cache1"]),
        delete: vi.fn().mockResolvedValue(true),
      });

      const { clearCache } = useSettings();
      await clearCache();

      expect(mockReg.unregister).toHaveBeenCalled();
      expect(caches.delete).toHaveBeenCalledWith("cache1");
      expect(mockClearManifestCache).toHaveBeenCalled();
      expect(window.location.reload).toHaveBeenCalled();
    });
  });

  describe("factoryReset", () => {
    it("does nothing if user cancels", async () => {
      vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
      const { factoryReset } = useSettings();
      await factoryReset();
      expect(mockIdb.clear).not.toHaveBeenCalled();
    });

    it("clears all storage and IDB on confirm", async () => {
      const spyLocalClear = vi.spyOn(localStorage, "clear");
      const { factoryReset } = useSettings();
      await factoryReset();

      expect(spyLocalClear).toHaveBeenCalled();
      expect(sessionStorage.clear).toHaveBeenCalled();
      expect(mockIdb.clear).toHaveBeenCalled();
      expect(window.location.reload).toHaveBeenCalled();
    });
  });
});
