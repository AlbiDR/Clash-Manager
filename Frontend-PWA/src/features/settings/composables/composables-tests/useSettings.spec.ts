import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref } from "vue";
import { setActivePinia, createPinia } from 'pinia';

const {
  mockStatus,
  mockIsShowcaseMode,
  mockIsBlueprintMode,
  mockIsSyntheticMode,
  mockTheme,
  mockSetTheme,
  mockClearManifestCache,
  mockHaptics,
  mockUpdateServiceWorker,
  mockToast,
  mockReload,
  mockConfirm,
  mockAppVersion,
} = vi.hoisted(() => {
  const { ref } = require("vue");
  return {
    mockAppVersion: ref("1.2.3"),
    mockStatus: ref("online"),
    mockIsShowcaseMode: ref(false),
    mockIsBlueprintMode: ref(false),
    mockIsSyntheticMode: ref(false),
    mockTheme: ref("auto"),
    mockSetTheme: vi.fn(),
    mockClearManifestCache: vi.fn(),
    mockHaptics: {
      tap: vi.fn(),
      medium: vi.fn(),
      heavy: vi.fn(),
    },
    mockUpdateServiceWorker: vi.fn(),
    mockToast: {
      info: vi.fn().mockReturnValue("toast-id"),
      success: vi.fn(),
      error: vi.fn(),
      remove: vi.fn(),
    },
    mockReload: vi.fn(),
    mockConfirm: vi.fn(),
  };
});

// Deep imports for services per Section 9
import { idb } from "../../../../core/services/StorageService";
import { useTheme } from "../../../../shared/composables/useTheme";
import { useAppSettings } from "../../../../core/services/useAppSettings";
import { useBlueprintMode } from "../../../../core/services/useBlueprintMode";
import { useClashDataStore } from "../../../../core/services/useClashDataStore";
import { useShowcaseMode } from "../../../../core/services/useShowcaseMode";
import { useSyntheticMode } from "../../../../core/services/useSyntheticMode";
import { useToast } from "../../../../core/services/useToast";
import { useConnectionStatus } from "../../../../core/services/useConnectionStatus";
import { useHaptics } from "../../../../core/services/useHaptics";
import { useWakeLock } from "../../../../core/services/useWakeLock";
import { useSystemInfo } from "../../../../core/services/useSystemInfo";
import { useRegisterSW } from "virtual:pwa-register/vue";
import { useSettings } from "../useSettings";

vi.mock("../../../../core/services/useSystemInfo", () => {
  const { computed } = require("vue");
  return {
    useSystemInfo: vi.fn(() => ({
      appVersion: mockAppVersion.value,
      activeBadge: computed(() => {
        if (mockIsShowcaseMode.value) return "SHOWCASE";
        if (mockIsBlueprintMode.value) return "BLUEPRINT";
        if (mockIsSyntheticMode.value) return "SYNTHETIC";
        return "";
      }),
    })),
    appVersion: mockAppVersion.value,
  };
});

vi.mock("../../../../shared/composables/useTheme", () => ({
  useTheme: vi.fn(() => ({
    theme: mockTheme,
    setTheme: mockSetTheme,
    clearManifestCache: mockClearManifestCache,
  })),
}));

vi.mock("../../../../core/services/StorageService", () => ({
  idb: {
    clear: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../../../core/services/useAppSettings", () => ({
  useAppSettings: vi.fn(() => ({
    modules: ref([]),
    toggle: vi.fn(),
    init: vi.fn(),
  })),
}));

vi.mock("../../../../core/services/useBlueprintMode", () => ({
  useBlueprintMode: vi.fn(() => ({
    isBlueprintMode: mockIsBlueprintMode,
    toggleBlueprintMode: vi.fn(),
  })),
}));

vi.mock("../../../../core/services/useClashDataStore", () => ({
  useClashDataStore: vi.fn(() => ({
    isHydrated: ref(true),
    isRefreshing: ref(false),
    refresh: vi.fn(),
  })),
}));

vi.mock("../../../../core/services/useShowcaseMode", () => ({
  useShowcaseMode: vi.fn(() => ({
    isShowcaseMode: mockIsShowcaseMode,
    toggleShowcaseMode: vi.fn(),
  })),
}));

vi.mock("../../../../core/services/useSyntheticMode", () => ({
  useSyntheticMode: vi.fn(() => ({
    isSyntheticMode: mockIsSyntheticMode,
    toggleSyntheticMode: vi.fn(),
  })),
}));

vi.mock("../../../../core/services/useToast", () => ({
  useToast: vi.fn(() => mockToast),
}));

vi.mock("../../../../core/services/useConnectionStatus", () => ({
  useConnectionStatus: vi.fn(() => ({
    status: mockStatus,
  })),
}));

vi.mock("../../../../core/services/useHaptics", () => ({
  useHaptics: vi.fn(() => mockHaptics),
}));

vi.mock("../../../../core/services/useWakeLock", () => ({
  useWakeLock: vi.fn(() => ({
    isActive: ref(false),
    request: vi.fn(),
    release: vi.fn(),
  })),
}));

vi.mock("virtual:pwa-register/vue", () => ({
  useRegisterSW: vi.fn(() => ({
    updateServiceWorker: mockUpdateServiceWorker,
  })),
}));

describe("useSettings", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal("location", { reload: mockReload });
    vi.stubGlobal("confirm", mockConfirm);
    vi.stubGlobal("localStorage", { clear: vi.fn() });
    vi.stubGlobal("sessionStorage", { clear: vi.fn() });
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistration: vi.fn(),
        getRegistrations: vi.fn(),
      },
    });
    vi.stubGlobal("caches", {
      keys: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(true),
    });
    // @ts-ignore
    global.__APP_VERSION__ = "1.2.3";

    // Reset mocks
    mockStatus.value = "online";
    mockIsShowcaseMode.value = false;
    mockIsBlueprintMode.value = false;
    mockIsSyntheticMode.value = false;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exposes the correct app version", () => {
    const { appVersion } = useSettings();
    expect(appVersion).toBe("1.2.3");
  });

  it("handles default app version if __APP_VERSION__ is undefined", () => {
    mockAppVersion.value = "0.0.0";
    const { appVersion } = useSettings();
    expect(appVersion).toBe("0.0.0");
    mockAppVersion.value = "1.2.3";
  });

  describe("footerBadgeText", () => {
    it("returns 'SHOWCASE' when in showcase mode", () => {
      mockIsShowcaseMode.value = true;
      const { footerBadgeText } = useSettings();
      expect(footerBadgeText.value).toBe("SHOWCASE");
    });

    it("returns 'BLUEPRINT' when in blueprint mode and not showcase", () => {
      mockIsBlueprintMode.value = true;
      const { footerBadgeText } = useSettings();
      expect(footerBadgeText.value).toBe("BLUEPRINT");
    });

    it("returns 'SYNTHETIC' when in synthetic mode and no others", () => {
      mockIsSyntheticMode.value = true;
      const { footerBadgeText } = useSettings();
      expect(footerBadgeText.value).toBe("SYNTHETIC");
    });

    it("returns empty string when no modes are active", () => {
      const { footerBadgeText } = useSettings();
      expect(footerBadgeText.value).toBe("");
    });

    it("prioritizes SHOWCASE over other modes", () => {
      mockIsShowcaseMode.value = true;
      mockIsBlueprintMode.value = true;
      mockIsSyntheticMode.value = true;
      const { footerBadgeText } = useSettings();
      expect(footerBadgeText.value).toBe("SHOWCASE");
    });
  });

  describe("apiStatusObject", () => {
    it("returns 'ready' for online status", () => {
      mockStatus.value = "online";
      const { apiStatusObject } = useSettings();
      expect(apiStatusObject.value).toEqual({ type: "ready", text: "Systems Online" });
    });

    it("returns 'error' for offline status", () => {
      mockStatus.value = "offline";
      const { apiStatusObject } = useSettings();
      expect(apiStatusObject.value).toEqual({ type: "error", text: "Disconnected" });
    });

    it("returns 'loading' for syncing status", () => {
      mockStatus.value = "syncing";
      const { apiStatusObject } = useSettings();
      expect(apiStatusObject.value).toEqual({ type: "loading", text: "Syncing..." });
    });

    it("returns 'ready' for success-resolve status", () => {
      mockStatus.value = "success-resolve";
      const { apiStatusObject } = useSettings();
      expect(apiStatusObject.value).toEqual({ type: "ready", text: "Verified" });
    });

    it("returns 'loading' for unknown status", () => {
      // @ts-ignore
      mockStatus.value = "something-else";
      const { apiStatusObject } = useSettings();
      expect(apiStatusObject.value).toEqual({ type: "loading", text: "Connecting..." });
    });
  });

  it("handles theme change with haptics", () => {
    const { handleThemeChange } = useSettings();
    handleThemeChange("dark");
    expect(mockHaptics.tap).toHaveBeenCalled();
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });

  describe("forceUpdate", () => {
    it("reports error if serviceWorker is not in navigator", async () => {
      vi.stubGlobal("navigator", {});
      const { forceUpdate } = useSettings();
      await forceUpdate();
      expect(mockToast.error).toHaveBeenCalledWith("Service Worker not available");
    });

    it("reports error if no registration is found", async () => {
      const { forceUpdate } = useSettings();
      await forceUpdate();
      expect(mockToast.error).toHaveBeenCalledWith("No active session found");
    });

    it("updates and reloads if a waiting worker exists", async () => {
      const mockReg = { waiting: {} };
      vi.stubGlobal("navigator", {
        serviceWorker: {
          getRegistration: vi.fn().mockResolvedValue(mockReg),
        },
      });
      const { forceUpdate } = useSettings();
      await forceUpdate();
      expect(mockToast.success).toHaveBeenCalledWith("Update ready! Reloading...");
      expect(mockUpdateServiceWorker).toHaveBeenCalledWith(true);
    });

    it("triggers update if no waiting worker", async () => {
      const mockReg = { update: vi.fn() };
      vi.stubGlobal("navigator", {
        serviceWorker: {
          getRegistration: vi.fn().mockResolvedValue(mockReg),
        },
      });
      const { forceUpdate } = useSettings();
      await forceUpdate();
      expect(mockReg.update).toHaveBeenCalled();
      expect(mockToast.success).toHaveBeenCalledWith("Clash Manager is up to date");
    });

    it("reports success if update results in installing/waiting state", async () => {
      const mockReg = {
        update: vi.fn().mockImplementation(function(this: any) {
          this.installing = {};
        }),
        installing: null,
        waiting: null
      };
      vi.stubGlobal("navigator", {
        serviceWorker: {
          getRegistration: vi.fn().mockResolvedValue(mockReg),
        },
      });
      const { forceUpdate } = useSettings();
      await forceUpdate();
      expect(mockToast.success).toHaveBeenCalledWith("Update found! Downloading...");
    });

    it("handles update failure", async () => {
      const mockReg = { update: vi.fn().mockRejectedValue(new Error("Fail")) };
      vi.stubGlobal("navigator", {
        serviceWorker: {
          getRegistration: vi.fn().mockResolvedValue(mockReg),
        },
      });
      const { forceUpdate } = useSettings();
      await forceUpdate();
      expect(mockToast.error).toHaveBeenCalledWith("Update check failed");
    });
  });

  describe("clearCache", () => {
    it("does nothing if user cancels", async () => {
      mockConfirm.mockReturnValue(false);
      const { clearCache } = useSettings();
      await clearCache();
      expect(mockReload).not.toHaveBeenCalled();
    });

    it("clears caches and reloads if user confirms", async () => {
      mockConfirm.mockReturnValue(true);
      const mockUnregister = vi.fn();
      vi.stubGlobal("navigator", {
        serviceWorker: {
          getRegistrations: vi.fn().mockResolvedValue([{ unregister: mockUnregister }]),
        },
      });
      const mockCacheDelete = vi.fn();
      vi.stubGlobal("caches", {
        keys: vi.fn().mockResolvedValue(["cache-v1"]),
        delete: mockCacheDelete,
      });

      const { clearCache } = useSettings();
      await clearCache();

      expect(mockHaptics.medium).toHaveBeenCalled();
      expect(mockUnregister).toHaveBeenCalled();
      expect(mockCacheDelete).toHaveBeenCalledWith("cache-v1");
      expect(mockClearManifestCache).toHaveBeenCalled();
      expect(mockReload).toHaveBeenCalled();
    });
  });

  describe("factoryReset", () => {
    it("does nothing if user cancels", async () => {
      mockConfirm.mockReturnValue(false);
      const { factoryReset } = useSettings();
      await factoryReset();
      expect(mockReload).not.toHaveBeenCalled();
    });

    it("clears storage and reloads if user confirms", async () => {
      mockConfirm.mockReturnValue(true);
      const { factoryReset } = useSettings();
      await factoryReset();

      expect(mockHaptics.heavy).toHaveBeenCalled();
      expect(localStorage.clear).toHaveBeenCalled();
      expect(sessionStorage.clear).toHaveBeenCalled();
      expect(idb.clear).toHaveBeenCalled();
      expect(mockReload).toHaveBeenCalled();
    });

    it("handles IDB clear failure gracefully", async () => {
      mockConfirm.mockReturnValue(true);
      vi.mocked(idb.clear).mockRejectedValue(new Error("IDB Error"));
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const { factoryReset } = useSettings();
      await factoryReset();

      expect(idb.clear).toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith("IDB clear failed", expect.any(Error));
      expect(mockReload).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });
});
