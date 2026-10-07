// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { resetConnectionState, useConnectionStatus } from "../useConnectionStatus";
import { useNetworkInfo } from "../useNetworkInfo";
import { useApiState } from "@core";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref } from "vue";

// Mock dependencies
vi.mock("../../api/useApiState", () => ({
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

    // @ts-expect-error -- test mock/state does not satisfy the full type
    vi.mocked(useApiState).mockReturnValue({
      apiStatus: mockApiStatus,
    });

    // @ts-expect-error -- test mock/state does not satisfy the full type
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
    const { status } = useConnectionStatus();

    // Simulate offline event
    window.dispatchEvent(new Event("offline"));

    expect(status.value).toBe("offline");
  });

  it("prioritizes API offline status if physically online (Priority #2)", () => {
    mockApiStatus.value = "offline";
    const { status } = useConnectionStatus();
    expect(status.value).toBe("offline");
  });

  it("treats unconfigured API status as offline (Priority #2)", () => {
    mockApiStatus.value = "unconfigured";
    const { status } = useConnectionStatus();
    expect(status.value).toBe("offline");
  });

  it("prioritizes success state over syncing (Priority #3) and clears fading state after timeout", () => {
    vi.useFakeTimers();
    const { status, setSuccess, setSyncing } = useConnectionStatus();

    setSyncing(true);
    expect(status.value).toBe("syncing");

    setSuccess();
    // Success should override syncing
    expect(status.value).toBe("success-resolve");

    // Before 1800ms, success-resolve remains active
    vi.advanceTimersByTime(1799);
    expect(status.value).toBe("success-resolve");

    // After 1800ms timeout, should revert to syncing if still syncing
    vi.advanceTimersByTime(1);
    expect(status.value).toBe("syncing");

    vi.useRealTimers();
  });

  it("returns 'syncing' when active (Priority #4)", () => {
    const { status, setSyncing } = useConnectionStatus();
    setSyncing(true);
    expect(status.value).toBe("syncing");
  });

  it("returns 'syncing' when API status is checking, waking, or stale (Priority #4)", () => {
    const { status } = useConnectionStatus();

    mockApiStatus.value = "checking";
    expect(status.value).toBe("syncing");

    mockApiStatus.value = "waking";
    expect(status.value).toBe("syncing");

    mockApiStatus.value = "stale";
    expect(status.value).toBe("syncing");
  });

  it("falls back to 'syncing' when API status is unknown or non-standard", () => {
    const { status } = useConnectionStatus();
    mockApiStatus.value = "some-unknown-status";
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
