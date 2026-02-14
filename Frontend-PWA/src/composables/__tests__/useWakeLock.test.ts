import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { nextTick } from "vue";

// Helper to get a fresh version of the composable
async function getWakeLockModule() {
  vi.resetModules();
  return await import("../useWakeLock");
}

describe("useWakeLock", () => {
  let mockSentinel: any;
  let mockRequest: any;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockSentinel = new EventTarget();
    mockSentinel.released = false;
    mockSentinel.type = "screen";
    mockSentinel.release = vi.fn().mockImplementation(async () => {
      mockSentinel.released = true;
      mockSentinel.dispatchEvent(new Event("release"));
    });

    mockRequest = vi.fn().mockResolvedValue(mockSentinel);

    vi.stubGlobal("navigator", {
      wakeLock: {
        request: mockRequest,
      },
    });

    vi.stubGlobal("document", {
      visibilityState: "visible",
      addEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("isSupported reflects navigator presence", async () => {
    const { useWakeLock } = await getWakeLockModule();
    expect(useWakeLock().isSupported).toBe(true);

    vi.stubGlobal("navigator", {});
    const { useWakeLock: useWakeLock2 } = await getWakeLockModule();
    expect(useWakeLock2().isSupported).toBe(false);
  });

  it("request() acquires lock and updates isActive", async () => {
    const { useWakeLock } = await getWakeLockModule();
    const { request, isActive } = useWakeLock();

    await request();

    expect(mockRequest).toHaveBeenCalledWith("screen");
    expect(isActive.value).toBe(true);
  });

  it("handles request failure gracefully", async () => {
    mockRequest.mockRejectedValueOnce(new Error("Permission denied"));
    const { useWakeLock } = await getWakeLockModule();
    const { request, isActive } = useWakeLock();

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await request();

    expect(isActive.value).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("release() releases lock and updates isActive", async () => {
    const { useWakeLock } = await getWakeLockModule();
    const { request, release, isActive } = useWakeLock();

    await request();
    expect(isActive.value).toBe(true);

    await release();
    expect(mockSentinel.release).toHaveBeenCalled();
    expect(isActive.value).toBe(false);
  });

  it("toggle() switches lock state", async () => {
    const { useWakeLock } = await getWakeLockModule();
    const { toggle, isActive } = useWakeLock();

    await toggle(); // Should call request
    expect(isActive.value).toBe(true);

    await toggle(); // Should call release
    expect(isActive.value).toBe(false);
  });

  it("updates isActive when sentinel is released by system", async () => {
    const { useWakeLock } = await getWakeLockModule();
    const { request, isActive } = useWakeLock();

    await request();
    expect(isActive.value).toBe(true);

    // Simulate system release
    mockSentinel.dispatchEvent(new Event("release"));
    expect(isActive.value).toBe(false);
  });

  it("re-acquires lock on visibility change if it should be active", async () => {
    let visibilityCallback: any;
    const addEventListenerSpy = vi.fn((event, cb) => {
      if (event === "visibilitychange") visibilityCallback = cb;
    });
    vi.stubGlobal("document", {
      visibilityState: "visible",
      addEventListener: addEventListenerSpy,
    });

    const { useWakeLock } = await getWakeLockModule();
    const { request, isActive } = useWakeLock();

    await request();
    expect(isActive.value).toBe(true);

    // Simulate system release (isActive becomes false)
    mockSentinel.dispatchEvent(new Event("release"));
    expect(isActive.value).toBe(false);

    // Simulate returning to visible
    mockRequest.mockClear();
    mockRequest.mockResolvedValue(new EventTarget());

    if (visibilityCallback) {
      await visibilityCallback();
    }

    expect(mockRequest).toHaveBeenCalled();
    // isActive should be true again after re-acquisition
    // Wait for the async request() call inside the listener
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(isActive.value).toBe(true);
  });

  it("init() re-acquires lock if shouldBeActive is true but inactive", async () => {
    const { useWakeLock } = await getWakeLockModule();
    const { request, init, isActive } = useWakeLock();

    // 1. Acquire
    await request();
    // 2. System release
    mockSentinel.dispatchEvent(new Event("release"));
    expect(isActive.value).toBe(false);

    // 3. Init should re-acquire
    mockRequest.mockClear();
    init(); // init is sync but calls async request()

    expect(mockRequest).toHaveBeenCalled();
    // Wait for async request()
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(isActive.value).toBe(true);
  });
});
