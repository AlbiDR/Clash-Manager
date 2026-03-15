import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * 🧪 USE WAKE LOCK TEST
 * Tests the wake lock service for browser support, requesting, releasing,
 * and auto-reacquisition logic.
 */

describe("useWakeLock", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should report unsupported if wakeLock is missing from navigator", async () => {
    vi.stubGlobal("navigator", {});
    const { useWakeLock } = await import("../useWakeLock");
    const { isSupported } = useWakeLock();
    expect(isSupported).toBe(false);
  });

  it("should report unsupported if navigator is undefined", async () => {
    vi.stubGlobal("navigator", undefined);
    const { useWakeLock } = await import("../useWakeLock");
    const { isSupported } = useWakeLock();
    expect(isSupported).toBe(false);
  });

  it("should not fail when calling request/release on unsupported browser", async () => {
    vi.stubGlobal("navigator", {});
    const { useWakeLock } = await import("../useWakeLock");
    const { request, release, isActive } = useWakeLock();

    await request();
    expect(isActive.value).toBe(false);

    await release();
    expect(isActive.value).toBe(false);
  });

  it("should successfully acquire wake lock", async () => {
    const mockSentinel = new EventTarget();
    (mockSentinel as any).release = vi.fn().mockResolvedValue(undefined);
    (mockSentinel as any).released = false;
    (mockSentinel as any).type = "screen";

    const mockRequest = vi.fn().mockResolvedValue(mockSentinel);
    vi.stubGlobal("navigator", {
      wakeLock: { request: mockRequest },
    });

    const { useWakeLock } = await import("../useWakeLock");
    const { request, isActive } = useWakeLock();

    await request();
    expect(mockRequest).toHaveBeenCalledWith("screen");
    expect(isActive.value).toBe(true);
  });

  it("should toggle wake lock state", async () => {
    const mockSentinel = new EventTarget();
    (mockSentinel as any).release = vi.fn().mockResolvedValue(undefined);
    const mockRequest = vi.fn().mockResolvedValue(mockSentinel);
    vi.stubGlobal("navigator", {
      wakeLock: { request: mockRequest },
    });

    const { useWakeLock } = await import("../useWakeLock");
    const { toggle, isActive } = useWakeLock();

    // Toggle ON
    await toggle();
    expect(isActive.value).toBe(true);
    expect(mockRequest).toHaveBeenCalledTimes(1);

    // Toggle OFF
    await toggle();
    expect(isActive.value).toBe(false);
    expect(mockSentinel.release).toHaveBeenCalledTimes(1);
  });

  it("should re-request lock on init if shouldBeActive is true", async () => {
    const mockSentinel = new EventTarget();
    const mockRequest = vi.fn().mockResolvedValue(mockSentinel);
    vi.stubGlobal("navigator", {
      wakeLock: { request: mockRequest },
    });

    const { useWakeLock } = await import("../useWakeLock");
    const { request, init, isActive } = useWakeLock();

    // First, make shouldBeActive true
    await request();
    expect(isActive.value).toBe(true);

    // Manually reset isActive to simulate some internal change or re-mount logic
    // (Though isActive is a singleton ref in this implementation)
    // Actually, to test init(), we need to have shouldBeActive = true but isActive.value = false.
    // This happens if the system releases the lock.
    mockSentinel.dispatchEvent(new Event("release"));
    expect(isActive.value).toBe(false);

    // Now init should re-acquire
    init();
    await vi.waitFor(() => expect(isActive.value).toBe(true));
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it("should handle request failure", async () => {
    const mockRequest = vi.fn().mockRejectedValue(new Error("Permission denied"));
    vi.stubGlobal("navigator", {
      wakeLock: { request: mockRequest },
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { useWakeLock } = await import("../useWakeLock");
    const { request, isActive } = useWakeLock();

    await request();
    expect(isActive.value).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("should handle release when no sentinel exists", async () => {
    vi.stubGlobal("navigator", {
      wakeLock: { request: vi.fn() },
    });
    const { useWakeLock } = await import("../useWakeLock");
    const { release, isActive } = useWakeLock();

    await release();
    expect(isActive.value).toBe(false);
  });

  it("should handle request returning null", async () => {
    const mockRequest = vi.fn().mockResolvedValue(null);
    vi.stubGlobal("navigator", {
      wakeLock: { request: mockRequest },
    });

    const { useWakeLock } = await import("../useWakeLock");
    const { request, isActive } = useWakeLock();

    await request();
    expect(isActive.value).toBe(false);
  });

  it("should re-acquire lock on visibilitychange to visible if shouldBeActive is true", async () => {
    const mockSentinel = new EventTarget();
    const mockRequest = vi.fn().mockResolvedValue(mockSentinel);
    vi.stubGlobal("navigator", {
      wakeLock: { request: mockRequest },
    });

    const eventListeners: Record<string, any[]> = {};
    vi.stubGlobal("document", {
      visibilityState: "hidden",
      addEventListener: vi.fn((event, cb) => {
        eventListeners[event] = eventListeners[event] || [];
        eventListeners[event].push(cb);
      }),
      removeEventListener: vi.fn(),
    });

    const { useWakeLock } = await import("../useWakeLock");
    const { request, isActive } = useWakeLock();

    // Acquire lock first
    await request();
    expect(isActive.value).toBe(true);

    // Simulate system release (e.g. tab hidden)
    mockSentinel.dispatchEvent(new Event("release"));
    expect(isActive.value).toBe(false);

    // Now simulate visibility change back to visible
    (document as any).visibilityState = "visible";
    const visibilityListener = eventListeners["visibilitychange"]?.[0];
    if (visibilityListener) {
      await visibilityListener();
    }

    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(isActive.value).toBe(true);
  });

  it("should NOT re-acquire lock on visibilitychange if shouldBeActive is false", async () => {
    const mockSentinel = new EventTarget();
    const mockRequest = vi.fn().mockResolvedValue(mockSentinel);
    vi.stubGlobal("navigator", {
      wakeLock: { request: mockRequest },
    });

    const eventListeners: Record<string, any[]> = {};
    vi.stubGlobal("document", {
      visibilityState: "hidden",
      addEventListener: vi.fn((event, cb) => {
        eventListeners[event] = eventListeners[event] || [];
        eventListeners[event].push(cb);
      }),
    });

    const { useWakeLock } = await import("../useWakeLock");
    const { release, isActive } = useWakeLock();

    // shouldBeActive is false by default. Let's ensure it's false by calling release.
    await release();
    expect(isActive.value).toBe(false);

    // Now simulate visibility change back to visible
    (document as any).visibilityState = "visible";
    const visibilityListener = eventListeners["visibilitychange"]?.[0];
    if (visibilityListener) {
      await visibilityListener();
    }

    expect(mockRequest).not.toHaveBeenCalled();
    expect(isActive.value).toBe(false);
  });
});
