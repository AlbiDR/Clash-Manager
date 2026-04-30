import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref, reactive, defineComponent, h } from "vue";
import { setActivePinia, createPinia } from 'pinia';

const mocks = vi.hoisted(() => {
  const { ref, reactive } = require("vue");
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
    mockRequestPermission: vi.fn().mockResolvedValue("granted"),
    mockSendLocalNotification: vi.fn(),
    mockIsWorkerConfigured: vi.fn().mockReturnValue(true),
    mockSubscribeToPush: vi.fn().mockResolvedValue(true),
    mockIsHydrated: ref(true),
    mockIsRefreshing: ref(false),
    mockLastSyncTime: ref(1700000000000),
    mockApiUrl: ref("https://mock-api.com"),
    mockApiStatus: ref("online"),
    mockPingData: ref({ latency: 42, version: "1.0.0" }),
    mockModules: reactive({ notificationThreshold: 75 }),
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
      appVersion: mocks.mockAppVersion.value,
      activeBadge: computed(() => {
        if (mocks.mockIsShowcaseMode.value) return "SHOWCASE";
        if (mocks.mockIsBlueprintMode.value) return "BLUEPRINT";
        if (mocks.mockIsSyntheticMode.value) return "SYNTHETIC";
        return "";
      }),
    })),
    appVersion: mocks.mockAppVersion.value,
  };
});

vi.mock("../../../../shared/composables/useTheme", () => ({
  useTheme: vi.fn(() => ({
    theme: mocks.mockTheme,
    setTheme: mocks.mockSetTheme,
    clearManifestCache: mocks.mockClearManifestCache,
  })),
}));

vi.mock("../../../../core/services/StorageService", () => ({
  idb: {
    clear: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../../../core/services/useAppSettings", () => {
  return {
    useAppSettings: vi.fn(() => ({
      modules: mocks.mockModules,
      toggle: vi.fn(),
      init: vi.fn(),
    })),
  };
});

vi.mock("../../../../core/services/useBlueprintMode", () => ({
  useBlueprintMode: vi.fn(() => ({
    isBlueprintMode: mocks.mockIsBlueprintMode,
    toggleBlueprintMode: vi.fn(),
  })),
}));

vi.mock("../../../../core/services/useClashDataStore", () => ({
  useClashDataStore: vi.fn(() => ({
    isHydrated: mocks.mockIsHydrated,
    isRefreshing: mocks.mockIsRefreshing,
    lastSyncTime: mocks.mockLastSyncTime,
    refresh: vi.fn(),
    startBackgroundSync: vi.fn(),
  })),
}));

vi.mock("../../../../core/services/useShowcaseMode", () => ({
  useShowcaseMode: vi.fn(() => ({
    isShowcaseMode: mocks.mockIsShowcaseMode,
    toggleShowcaseMode: vi.fn(),
  })),
}));

vi.mock("../../../../core/services/useSyntheticMode", () => ({
  useSyntheticMode: vi.fn(() => ({
    isSyntheticMode: mocks.mockIsSyntheticMode,
    toggleSyntheticMode: vi.fn(),
  })),
}));

vi.mock("../../../../core/services/useToast", () => ({
  useToast: vi.fn(() => mocks.mockToast),
}));

vi.mock("../../../../core/services/useConnectionStatus", () => ({
  useConnectionStatus: vi.fn(() => ({
    status: mocks.mockStatus,
  })),
}));

vi.mock("../../../../core/services/useHaptics", () => ({
  useHaptics: vi.fn(() => mocks.mockHaptics),
}));

vi.mock("../../../../core/api/useApiState", () => {
  return {
    useApiState: vi.fn(() => ({
      apiUrl: mocks.mockApiUrl,
      apiStatus: mocks.mockApiStatus,
      pingData: mocks.mockPingData,
    })),
  };
});

vi.mock("../../../../core/services/useBadge", () => ({
  useBadge: vi.fn(() => ({
    requestPermission: mocks.mockRequestPermission,
    sendLocalNotification: mocks.mockSendLocalNotification,
  })),
}));

vi.mock("../../../../core/api/SupabaseClient", () => ({
  isWorkerConfigured: mocks.mockIsWorkerConfigured,
  subscribeToPush: mocks.mockSubscribeToPush,
}));

vi.mock("../../../../core/services/useWakeLock", () => ({
  useWakeLock: vi.fn(() => ({
    isActive: ref(false),
    request: vi.fn(),
    release: vi.fn(),
    isSupported: true,
    toggle: vi.fn(),
  })),
}));

vi.mock("virtual:pwa-register/vue", () => ({
  useRegisterSW: vi.fn(() => ({
    updateServiceWorker: mocks.mockUpdateServiceWorker,
  })),
}));

// Helper to run composable within a component context
function withSetup<T>(hook: () => T) {
  let result: T;
  const setup = defineComponent({
    setup() {
      result = hook();
      return () => h("div");
    },
  });
  const wrapper = require("@vue/test-utils").mount(setup);
  return { result: result!, wrapper };
}

describe("useSettings", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal("location", { reload: mocks.mockReload });
    vi.stubGlobal("confirm", mocks.mockConfirm);
    vi.stubGlobal("localStorage", {
      clear: vi.fn(),
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
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
    mocks.mockStatus.value = "online";
    mocks.mockIsShowcaseMode.value = false;
    mocks.mockIsBlueprintMode.value = false;
    mocks.mockIsSyntheticMode.value = false;
    mocks.mockApiStatus.value = "online";
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exposes the correct app version", () => {
    const { result } = withSetup(useSettings);
    expect(result.appVersion).toBe("1.2.3");
  });

  it("handles default app version if __APP_VERSION__ is undefined", () => {
    mocks.mockAppVersion.value = "0.0.0";
    const { result } = withSetup(useSettings);
    expect(result.appVersion).toBe("0.0.0");
    mocks.mockAppVersion.value = "1.2.3";
  });

  describe("footerBadgeText", () => {
    it("returns 'SHOWCASE' when in showcase mode", () => {
      mocks.mockIsShowcaseMode.value = true;
      const { result } = withSetup(useSettings);
      expect(result.footerBadgeText.value).toBe("SHOWCASE");
    });

    it("returns 'BLUEPRINT' when in blueprint mode and not showcase", () => {
      mocks.mockIsBlueprintMode.value = true;
      const { result } = withSetup(useSettings);
      expect(result.footerBadgeText.value).toBe("BLUEPRINT");
    });

    it("returns 'SYNTHETIC' when in synthetic mode and no others", () => {
      mocks.mockIsSyntheticMode.value = true;
      const { result } = withSetup(useSettings);
      expect(result.footerBadgeText.value).toBe("SYNTHETIC");
    });

    it("returns empty string when no modes are active", () => {
      const { result } = withSetup(useSettings);
      expect(result.footerBadgeText.value).toBe("");
    });

    it("prioritizes SHOWCASE over other modes", () => {
      mocks.mockIsShowcaseMode.value = true;
      mocks.mockIsBlueprintMode.value = true;
      mocks.mockIsSyntheticMode.value = true;
      const { result } = withSetup(useSettings);
      expect(result.footerBadgeText.value).toBe("SHOWCASE");
    });
  });

  describe("apiStatusObject", () => {
    it("returns 'success' for online status", () => {
      mocks.mockStatus.value = "online";
      const { result } = withSetup(useSettings);
      expect(result.apiStatusObject.value).toEqual({ type: "success", text: "Systems Online" });
    });

    it("returns 'error' for offline status", () => {
      mocks.mockStatus.value = "offline";
      const { result } = withSetup(useSettings);
      expect(result.apiStatusObject.value).toEqual({ type: "error", text: "Disconnected" });
    });

    it("returns 'loading' for syncing status", () => {
      mocks.mockStatus.value = "syncing";
      const { result } = withSetup(useSettings);
      expect(result.apiStatusObject.value).toEqual({ type: "loading", text: "Syncing..." });
    });

    it("returns 'success' for success-resolve status", () => {
      mocks.mockStatus.value = "success-resolve";
      const { result } = withSetup(useSettings);
      expect(result.apiStatusObject.value).toEqual({ type: "success", text: "Verified" });
    });

    it("returns 'loading' for unknown status", () => {
      // @ts-ignore
      mocks.mockStatus.value = "something-else";
      const { result } = withSetup(useSettings);
      expect(result.apiStatusObject.value).toEqual({ type: "loading", text: "Connecting..." });
    });
  });

  it("handles theme change with haptics", () => {
    const { result } = withSetup(useSettings);
    result.handleThemeChange("dark");
    expect(mocks.mockHaptics.tap).toHaveBeenCalled();
    expect(mocks.mockSetTheme).toHaveBeenCalledWith("dark");
  });

  describe("forceUpdate", () => {
    it("reports error if serviceWorker is not in navigator", async () => {
      vi.stubGlobal("navigator", {});
      const { result } = withSetup(useSettings);
      await result.forceUpdate();
      expect(mocks.mockToast.error).toHaveBeenCalledWith("Service Worker not available");
    });

    it("reports error if no registration is found", async () => {
      const { result } = withSetup(useSettings);
      await result.forceUpdate();
      expect(mocks.mockToast.error).toHaveBeenCalledWith("No active session found");
    });

    it("updates and reloads if a waiting worker exists", async () => {
      const mockReg = { waiting: {} };
      vi.stubGlobal("navigator", {
        serviceWorker: {
          getRegistration: vi.fn().mockResolvedValue(mockReg),
        },
      });
      const { result } = withSetup(useSettings);
      await result.forceUpdate();
      expect(mocks.mockToast.success).toHaveBeenCalledWith("Update ready! Reloading...");
      expect(mocks.mockUpdateServiceWorker).toHaveBeenCalledWith(true);
    });

    it("triggers update if no waiting worker", async () => {
      const mockReg = { update: vi.fn() };
      vi.stubGlobal("navigator", {
        serviceWorker: {
          getRegistration: vi.fn().mockResolvedValue(mockReg),
        },
      });
      const { result } = withSetup(useSettings);
      await result.forceUpdate();
      expect(mockReg.update).toHaveBeenCalled();
      expect(mocks.mockToast.success).toHaveBeenCalledWith("Clash Manager is up to date");
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
      const { result } = withSetup(useSettings);
      await result.forceUpdate();
      expect(mocks.mockToast.success).toHaveBeenCalledWith("Update found! Downloading...");
    });

    it("handles update failure", async () => {
      const mockReg = { update: vi.fn().mockRejectedValue(new Error("Fail")) };
      vi.stubGlobal("navigator", {
        serviceWorker: {
          getRegistration: vi.fn().mockResolvedValue(mockReg),
        },
      });
      const { result } = withSetup(useSettings);
      await result.forceUpdate();
      expect(mocks.mockToast.error).toHaveBeenCalledWith("Update check failed");
    });
  });

  describe("clearCache", () => {
    it("does nothing if user cancels", async () => {
      mocks.mockConfirm.mockReturnValue(false);
      const { result } = withSetup(useSettings);
      await result.clearCache();
      expect(mocks.mockReload).not.toHaveBeenCalled();
    });

    it("clears caches and reloads if user confirms", async () => {
      mocks.mockConfirm.mockReturnValue(true);
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

      const { result } = withSetup(useSettings);
      await result.clearCache();

      expect(mocks.mockHaptics.medium).toHaveBeenCalled();
      expect(mockUnregister).toHaveBeenCalled();
      expect(mockCacheDelete).toHaveBeenCalledWith("cache-v1");
      expect(mocks.mockClearManifestCache).toHaveBeenCalled();
      expect(mocks.mockReload).toHaveBeenCalled();
    });
  });

  describe("factoryReset", () => {
    it("does nothing if user cancels", async () => {
      mocks.mockConfirm.mockReturnValue(false);
      const { result } = withSetup(useSettings);
      await result.factoryReset();
      expect(mocks.mockReload).not.toHaveBeenCalled();
    });

    it("clears storage and reloads if user confirms", async () => {
      mocks.mockConfirm.mockReturnValue(true);
      const { result } = withSetup(useSettings);
      await result.factoryReset();

      expect(mocks.mockHaptics.heavy).toHaveBeenCalled();
      expect(localStorage.clear).toHaveBeenCalled();
      expect(sessionStorage.clear).toHaveBeenCalled();
      expect(idb.clear).toHaveBeenCalled();
      expect(mocks.mockReload).toHaveBeenCalled();
    });

    it("handles IDB clear failure gracefully", async () => {
      mocks.mockConfirm.mockReturnValue(true);
      vi.mocked(idb.clear).mockRejectedValue(new Error("IDB Error"));
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const { result } = withSetup(useSettings);
      await result.factoryReset();

      expect(idb.clear).toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith("IDB clear failed", expect.any(Error));
      expect(mocks.mockReload).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });

  describe("API URL Management", () => {
    it("updates API URL and reloads", () => {
      const { result } = withSetup(useSettings);
      result.updateApiUrl(" https://new-api.com ");
      expect(localStorage.setItem).toHaveBeenCalledWith("cm_supabase_url", "https://new-api.com");
      expect(mocks.mockReload).toHaveBeenCalled();
    });

    it("does not update for empty URL", () => {
      const { result } = withSetup(useSettings);
      result.updateApiUrl(" ");
      expect(mocks.mockReload).not.toHaveBeenCalled();
    });

    it("resets API URL and reloads on confirmation", () => {
      mocks.mockConfirm.mockReturnValue(true);
      const { result } = withSetup(useSettings);
      result.resetApiUrl();
      expect(localStorage.removeItem).toHaveBeenCalledWith("cm_supabase_url");
      expect(mocks.mockReload).toHaveBeenCalled();
    });
  });

  describe("Notification Management", () => {
    it("requests notification permission with haptics", async () => {
      const { result } = withSetup(useSettings);
      await result.requestNotificationPermission();
      expect(mocks.mockHaptics.tap).toHaveBeenCalled();
      expect(mocks.mockRequestPermission).toHaveBeenCalled();
      expect(result.notificationPermission.value).toBe("granted");
    });

    describe("subscribePush", () => {
      it("reports error if worker not configured", async () => {
        mocks.mockIsWorkerConfigured.mockReturnValue(false);
        const { result } = withSetup(useSettings);
        await result.subscribePush();
        expect(mocks.mockToast.error).toHaveBeenCalledWith("Cloud Worker not configured");
      });

      it("subscribes to push successfully", async () => {
        mocks.mockIsWorkerConfigured.mockReturnValue(true);
        const mockSubscribe = vi.fn().mockResolvedValue({ endpoint: "mock" });
        vi.stubGlobal("navigator", {
          serviceWorker: {
            ready: Promise.resolve({
              pushManager: { subscribe: mockSubscribe }
            })
          }
        });

        const { result } = withSetup(useSettings);
        await result.subscribePush();

        expect(mocks.mockHaptics.medium).toHaveBeenCalled();
        expect(mockSubscribe).toHaveBeenCalled();
        expect(mocks.mockSubscribeToPush).toHaveBeenCalledWith({ endpoint: "mock" });
        expect(result.isPushSubscribed.value).toBe(true);
        expect(mocks.mockToast.success).toHaveBeenCalledWith("Push Alerts Active");
      });

      it("handles push setup failure (navigator error)", async () => {
        mocks.mockIsWorkerConfigured.mockReturnValue(true);
        // Simulate navigator error by making ready a rejecting promise
        vi.stubGlobal("navigator", {
          serviceWorker: {
            ready: Promise.reject(new Error("SW Failure"))
          }
        });

        const { result } = withSetup(useSettings);
        await result.subscribePush();
        expect(mocks.mockToast.error).toHaveBeenCalledWith("Push setup failed");
      });

      it("handles server registration failure", async () => {
        mocks.mockIsWorkerConfigured.mockReturnValue(true);
        mocks.mockSubscribeToPush.mockResolvedValue(false);
        const mockSubscribe = vi.fn().mockResolvedValue({ endpoint: "mock" });
        vi.stubGlobal("navigator", {
          serviceWorker: {
            ready: Promise.resolve({
              pushManager: { subscribe: mockSubscribe }
            })
          }
        });

        const { result } = withSetup(useSettings);
        await result.subscribePush();
        expect(mocks.mockToast.error).toHaveBeenCalledWith("Server registration failed");
      });
    });

    describe("sendTestNotification", () => {
      it("sends message to service worker if available", async () => {
        const mockPostMessage = vi.fn();
        vi.stubGlobal("navigator", {
          serviceWorker: {
            controller: { postMessage: mockPostMessage }
          }
        });

        const { result } = withSetup(useSettings);
        await result.sendTestNotification();

        expect(mocks.mockHaptics.heavy).toHaveBeenCalled();
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: "BADGE_NOTIFICATION_ANDROID",
          count: 1,
          threshold: 75
        });
      });

      it("falls back to local notification", async () => {
        vi.stubGlobal("navigator", { serviceWorker: {} });
        const { result } = withSetup(useSettings);
        await result.sendTestNotification();
        expect(mocks.mockSendLocalNotification).toHaveBeenCalled();
      });
    });

    it("sets notification threshold with haptics and sync", () => {
      const { result } = withSetup(useSettings);
      result.setNotificationThreshold(50);
      expect(mocks.mockHaptics.tap).toHaveBeenCalled();
      expect(mocks.mockModules.notificationThreshold).toBe(50);
    });

    it("formats last sync time correctly", () => {
      const { result } = withSetup(useSettings);
      // Date(1700000000000) = 2023-11-14T22:13:20.000Z
      // result depends on environment locale but should not be "Never"
      expect(result.lastSyncFormatted.value).not.toBe("Never");
    });
  });
});
