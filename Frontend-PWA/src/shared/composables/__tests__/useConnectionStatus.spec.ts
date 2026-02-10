import { resetConnectionState, useConnectionStatus, useNetworkInfo , ConsoleLayout, ConsoleHeader, FloatingDock, HeaderInfoOverlay } from "@shared";
import { useApiState } from "@core";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref } from "vue";

// Mock dependencies
vi.mock("../useApiState", () => ({
  useApiState: vi.fn(),
}));

vi.mock("../useNetworkInfo", () => ({
  useNetworkInfo: vi.fn(),
}));

// Mock Navigator
const originalNavigator = globalThis.navigator;
const onLineValue = ref(true);

describe("useConnectionStatus", () => {
  let mockApiStatus: any;
  let mockIsSlow: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset global module state
    resetConnectionState();

    // Reset mocks
    mockApiStatus = ref("online");
    mockIsSlow = ref(false);
    onLineValue.value = true;

    // @ts-ignore
    vi.mocked(useApiState).mockReturnValue({
      apiStatus: mockApiStatus,
    });

    // @ts-ignore
    vi.mocked(useNetworkInfo).mockReturnValue({
      isSlowConnection: mockIsSlow,
      effectiveType: ref("4g"),
    });

    // Mock navigator.onLine
    Object.defineProperty(globalThis, "navigator", {
      value: { ...originalNavigator, onLine: true },
      writable: true,
    });
  });

  afterEach(() => {
    // Restore navigator
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      writable: true,
    });
  });

  it("returns 'online' by default", () => {
    const { status } = useConnectionStatus();
    expect(status.value).toBe("online");
  });

  it("prioritizes physical offline status (Priority #1)", () => {
    // Set navigator.onLine to false (simulating event listener trigger)
    // Note: In our composable we listen to window events.
    // Testing the event listener specifically is hard in JSDOM without triggering real events.
    // Instead we can access the internal ref if we exposed it, or simulate the event.

    const { status, isOnline } = useConnectionStatus();

    // Simulate offline event
    window.dispatchEvent(new Event("offline"));

    expect(status.value).toBe("offline");
  });

  it("prioritizes API offline status if physically online (Priority #2)", () => {
    mockApiStatus.value = "offline";
    const { status } = useConnectionStatus();
    expect(status.value).toBe("offline");
  });

  it("prioritizes success state over syncing (Priority #3)", async () => {
    const { status, setSuccess, setSyncing } = useConnectionStatus();

    vi.useFakeTimers();

    setSyncing(true);
    expect(status.value).toBe("syncing");

    setSuccess();
    // Success should override syncing
    expect(status.value).toBe("success-resolve");

    // After timeout, should revert to syncing if still syncing
    vi.advanceTimersByTime(1800);
    expect(status.value).toBe("syncing");

    vi.useRealTimers();
  });

  it("returns 'syncing' when active (Priority #4)", () => {
    const { status, setSyncing } = useConnectionStatus();
    setSyncing(true);
    expect(status.value).toBe("syncing");
  });

  it("returns 'syncing' when API is checking (Priority #4)", () => {
    mockApiStatus.value = "checking";
    const { status } = useConnectionStatus();
    expect(status.value).toBe("syncing");
  });

  it("returns 'slow' when connection is slow (Priority #5)", () => {
    mockIsSlow.value = true;
    const { status } = useConnectionStatus();
    expect(status.value).toBe("slow");
  });

  it("correctly orders priorities (Slow < Syncing < Success < Offline)", () => {
    const { status, setSyncing, setSuccess } = useConnectionStatus();
    mockIsSlow.value = true; // Priority 5

    expect(status.value).toBe("slow");

    setSyncing(true); // Priority 4
    expect(status.value).toBe("syncing");

    setSuccess(); // Priority 3
    expect(status.value).toBe("success-resolve");

    mockApiStatus.value = "offline"; // Priority 2
    expect(status.value).toBe("offline");

    // Clear API offline
    mockApiStatus.value = "online";
    expect(status.value).toBe("success-resolve"); // Back to success
  });
});
