import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { reactive } from "vue";

// Mocking sub-composables
const mockModules = reactive({
  notificationThreshold: 75,
  notificationQuietMode: false,
  notificationSound: true,
});

vi.mock("../useAppSettings", () => ({
  useAppSettings: () => ({
    modules: mockModules,
  }),
}));

const mockPost = vi.fn();
vi.mock("../useBroadcastChannel", () => ({
  useBroadcastChannel: () => ({
    post: mockPost,
  }),
}));

describe("useBadge", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    mockPost.mockClear();

    // Reset mockModules to default state
    mockModules.notificationThreshold = 75;
    mockModules.notificationQuietMode = false;
    mockModules.notificationSound = true;

    // Default to non-Android
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      setAppBadge: vi.fn().mockResolvedValue(undefined),
      clearAppBadge: vi.fn().mockResolvedValue(undefined),
      serviceWorker: {
        controller: {
          postMessage: vi.fn(),
        },
      },
    });
    vi.stubGlobal("Notification", {
      permission: "default",
      requestPermission: vi.fn().mockResolvedValue("granted"),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should detect support", async () => {
    const { useBadge } = await import("../useBadge");
    const { isSupported } = useBadge();
    expect(isSupported).toBe(true);
  });

  it("should return false for isSupported if no SW and on Android", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "Android",
    });
    const { useBadge } = await import("../useBadge");
    const { isSupported } = useBadge();
    expect(isSupported).toBe(false);
  });

  it("should return false for isSupported if no SW and no setAppBadge", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "Macintosh",
    });
    const { useBadge } = await import("../useBadge");
    const { isSupported } = useBadge();
    expect(isSupported).toBe(false);
  });

  it("should set badge via setAppBadge on non-Android", async () => {
    const { useBadge } = await import("../useBadge");
    const { setBadge } = useBadge();

    await setBadge(5);

    expect(navigator.setAppBadge).toHaveBeenCalledWith(5);
    expect(navigator.serviceWorker.controller?.postMessage).toHaveBeenCalledWith({
      type: "SET_BADGE",
      count: 5,
    });
    expect(mockPost).toHaveBeenCalledWith({ type: "BADGE_UPDATE", count: 5 });
  });

  it("should debounce badge updates (1500ms)", async () => {
    const { useBadge } = await import("../useBadge");
    const { setBadge } = useBadge();

    await setBadge(5);
    expect(navigator.setAppBadge).toHaveBeenCalledTimes(1);

    // Immediate second call should be ignored due to debounce
    await setBadge(10);
    expect(navigator.setAppBadge).toHaveBeenCalledTimes(1);

    // Advance time by 1600ms (more than 1500ms debounce)
    vi.advanceTimersByTime(1600);

    await setBadge(10);
    expect(navigator.setAppBadge).toHaveBeenCalledTimes(2);
    expect(navigator.setAppBadge).toHaveBeenLastCalledWith(10);
  });

  it("should use notification-based badges on Android", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Android 10; Mobile; rv:68.0) Gecko/68.0 Firefox/68.0",
      serviceWorker: {
        controller: {
          postMessage: vi.fn(),
        },
      },
    });

    const { useBadge } = await import("../useBadge");
    const { setBadge } = useBadge();

    await setBadge(5);

    expect(navigator.serviceWorker.controller?.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "BADGE_NOTIFICATION_ANDROID",
      count: 5,
    }));
    // Should NOT call setAppBadge (it's not even in the mock now)
    expect((navigator as any).setAppBadge).toBeUndefined();
  });

  it("should suppress badges in quiet mode on Android", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "Android 10",
      serviceWorker: {
        controller: {
          postMessage: vi.fn(),
        },
      },
    });
    mockModules.notificationQuietMode = true;

    const { useBadge } = await import("../useBadge");
    const { setBadge } = useBadge();

    await setBadge(5);

    expect(navigator.serviceWorker.controller?.postMessage).not.toHaveBeenCalled();
  });

  it("should do nothing in setBadge if not supported", async () => {
    vi.stubGlobal("navigator", { userAgent: "Android" });
    const { useBadge } = await import("../useBadge");
    const { setBadge } = useBadge();

    await setBadge(5);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("should handle null service worker controller in setBadge (Android)", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "Android",
      serviceWorker: { controller: null },
    });
    const { useBadge } = await import("../useBadge");
    const { setBadge } = useBadge();

    await setBadge(5);
    // Should not throw and should still broadcast since it's "supported" by SW existence
    expect(mockPost).toHaveBeenCalled();
  });

  it("should handle null service worker controller in setBadge (non-Android)", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "Macintosh",
      setAppBadge: vi.fn().mockResolvedValue(undefined),
      serviceWorker: { controller: null },
    });
    const { useBadge } = await import("../useBadge");
    const { setBadge } = useBadge();

    await setBadge(5);
    expect(navigator.setAppBadge).toHaveBeenCalledWith(5);
    expect(mockPost).toHaveBeenCalled();
  });

  it("should floor and clamp badge count to 0", async () => {
    const { useBadge } = await import("../useBadge");
    const { setBadge } = useBadge();

    // Reset lastUpdate by waiting long enough
    vi.advanceTimersByTime(2000);

    await setBadge(5.7);
    expect(navigator.setAppBadge).toHaveBeenCalledWith(5);

    // Ensure we are outside the debounce window for the second call
    vi.advanceTimersByTime(2000);
    await setBadge(0);
    expect(navigator.clearAppBadge).toHaveBeenCalled();
  });

  it("should retry on failure (MAX_RETRIES = 2)", async () => {
    const setAppBadge = vi.fn()
      .mockRejectedValueOnce(new Error("Transient Error 1"))
      .mockRejectedValueOnce(new Error("Transient Error 2"))
      .mockResolvedValueOnce(undefined);

    vi.stubGlobal("navigator", {
      userAgent: "Macintosh",
      setAppBadge,
      serviceWorker: { controller: { postMessage: vi.fn() } }
    });

    const { useBadge } = await import("../useBadge");
    const { setBadge } = useBadge();

    await setBadge(5);

    expect(setAppBadge).toHaveBeenCalledTimes(1);

    // First retry at 800ms
    await vi.advanceTimersByTimeAsync(800);
    expect(setAppBadge).toHaveBeenCalledTimes(2);

    // Second retry at 1600ms (800 * 2)
    await vi.advanceTimersByTimeAsync(1600);
    expect(setAppBadge).toHaveBeenCalledTimes(3);
  });

  it("should send local notifications if permission granted", async () => {
    vi.stubGlobal("Notification", {
      permission: "granted",
      requestPermission: vi.fn(),
    });

    const { useBadge } = await import("../useBadge");
    const { sendLocalNotification } = useBadge();

    await sendLocalNotification("Elite Recruit Found", "A high score candidate appeared", "hh-channel");

    expect(navigator.serviceWorker.controller?.postMessage).toHaveBeenCalledWith({
      type: "SHOW_NOTIFICATION",
      title: "Elite Recruit Found",
      options: expect.objectContaining({
        body: "A high score candidate appeared",
        channelId: "hh-channel",
      }),
    });
  });

  it("should respect silent setting based on notificationSound", async () => {
    vi.stubGlobal("Notification", {
      permission: "granted",
    });
    mockModules.notificationSound = false;

    const { useBadge } = await import("../useBadge");
    const { sendLocalNotification } = useBadge();

    await sendLocalNotification("Silent Title");

    expect(navigator.serviceWorker.controller?.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({
        silent: true,
      }),
    }));
  });

  it("should NOT send notifications in Quiet Mode", async () => {
    vi.stubGlobal("Notification", {
      permission: "granted",
    });
    mockModules.notificationQuietMode = true;

    const { useBadge } = await import("../useBadge");
    const { sendLocalNotification } = useBadge();

    await sendLocalNotification("Hidden Title");

    expect(navigator.serviceWorker.controller?.postMessage).not.toHaveBeenCalled();
  });

  it("should NOT send notifications if permission is not granted", async () => {
    vi.stubGlobal("Notification", {
      permission: "denied",
    });

    const { useBadge } = await import("../useBadge");
    const { sendLocalNotification } = useBadge();

    await sendLocalNotification("Title");
    expect(navigator.serviceWorker.controller?.postMessage).not.toHaveBeenCalled();
  });

  it("should handle null service worker controller in sendLocalNotification", async () => {
    vi.stubGlobal("Notification", {
      permission: "granted",
    });
    vi.stubGlobal("navigator", {
      serviceWorker: { controller: null },
    });

    const { useBadge } = await import("../useBadge");
    const { sendLocalNotification } = useBadge();

    await sendLocalNotification("Title");
    // Should not throw
  });

  it("should request notification permission", async () => {
    const requestPermission = vi.fn().mockResolvedValue("granted");
    vi.stubGlobal("Notification", {
      requestPermission,
    });

    const { useBadge } = await import("../useBadge");
    const { requestPermission: reqPerm } = useBadge();

    const result = await reqPerm();
    expect(requestPermission).toHaveBeenCalled();
    expect(result).toBe("granted");
  });

  it("should handle denied notification permission", async () => {
    const requestPermission = vi.fn().mockResolvedValue("denied");
    vi.stubGlobal("Notification", {
      requestPermission,
    });

    const { useBadge } = await import("../useBadge");
    const { requestPermission: reqPerm } = useBadge();

    const result = await reqPerm();
    expect(result).toBe("denied");
  });

  it("should fallback to denied if Notification is undefined in requestPermission", async () => {
    vi.stubGlobal("Notification", undefined);

    const { useBadge } = await import("../useBadge");
    const { requestPermission: reqPerm } = useBadge();

    const result = await reqPerm();
    expect(result).toBe("denied");
  });

  it("should explicitly clear badge", async () => {
    const { useBadge } = await import("../useBadge");
    const { clearBadge } = useBadge();

    // Reset lastUpdate by waiting long enough
    vi.advanceTimersByTime(2000);

    await clearBadge();
    expect(navigator.clearAppBadge).toHaveBeenCalled();
  });
});
