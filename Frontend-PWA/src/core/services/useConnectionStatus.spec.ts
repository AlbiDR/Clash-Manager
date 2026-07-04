// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useConnectionStatus, resetConnectionState } from "./useConnectionStatus";
import { useApiState } from "../api/useApiState";
import { useNetworkInfo } from "./useNetworkInfo";
import { ref } from "vue";

// Mocking dependencies
vi.mock("../api/useApiState", () => ({
  useApiState: vi.fn(),
}));

vi.mock("./useNetworkInfo", () => ({
  useNetworkInfo: vi.fn(),
}));

describe("useConnectionStatus", () => {
  const apiStatus = ref("online");
  const isSlowConnection = ref(false);
  const effectiveType = ref("4g");

  beforeEach(() => {
    vi.clearAllMocks();
    resetConnectionState();

    // Default mock implementations
    (useApiState as any).mockReturnValue({
      apiStatus,
    });

    (useNetworkInfo as any).mockReturnValue({
      isSlowConnection,
      effectiveType,
    });

    // Reset refs
    apiStatus.value = "online";
    isSlowConnection.value = false;
    effectiveType.value = "4g";

    // Mock navigator.onLine
    vi.stubGlobal("navigator", { onLine: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should return stable 'online' status when everything is healthy", () => {
    const { status } = useConnectionStatus();
    expect(status.value).toBe("online");
  });

  it("should return 'offline' when navigator.onLine is false (Physical Priority)", () => {
    vi.stubGlobal("navigator", { onLine: false });

    // We need to trigger the 'offline' event because isOnline is a module-level ref
    // initialized once. However, useConnectionStatus.ts attaches listeners.
    window.dispatchEvent(new Event("offline"));

    const { status } = useConnectionStatus();
    expect(status.value).toBe("offline");
  });

  it("should return 'offline' when apiStatus is 'offline' or 'unconfigured' (Logical Priority)", () => {
    apiStatus.value = "offline";
    const { status } = useConnectionStatus();
    expect(status.value).toBe("offline");

    apiStatus.value = "unconfigured";
    expect(status.value).toBe("offline");
  });

  it("should return 'success-resolve' when success fading is active", () => {
    vi.useFakeTimers();
    const { status, setSuccess } = useConnectionStatus();

    setSuccess();
    expect(status.value).toBe("success-resolve");

    vi.advanceTimersByTime(1800);
    expect(status.value).toBe("online");
    vi.useRealTimers();
  });

  it("should return 'syncing' when manually set to syncing", () => {
    const { status, setSyncing } = useConnectionStatus();

    setSyncing(true);
    expect(status.value).toBe("syncing");

    setSyncing(false);
    expect(status.value).toBe("online");
  });

  it("should return 'syncing' when apiStatus is in intermediate states", () => {
    const intermediateStates = ["checking", "waking", "stale"];
    const { status } = useConnectionStatus();

    intermediateStates.forEach((state) => {
      apiStatus.value = state;
      expect(status.value).toBe("syncing");
    });
  });

  it("should return 'slow' when network is degraded", () => {
    isSlowConnection.value = true;
    const { status } = useConnectionStatus();
    expect(status.value).toBe("slow");
  });

  it("should react to 'online' event after being offline", () => {
    vi.stubGlobal("navigator", { onLine: false });
    window.dispatchEvent(new Event("offline"));

    const { status } = useConnectionStatus();
    expect(status.value).toBe("offline");

    vi.stubGlobal("navigator", { onLine: true });
    window.dispatchEvent(new Event("online"));
    expect(status.value).toBe("online");
  });

  it("should provide access to underlying network info", () => {
    const { isSlow, type } = useConnectionStatus();

    expect(isSlow.value).toBe(false);
    expect(type.value).toBe("4g");

    isSlowConnection.value = true;
    effectiveType.value = "2g";

    expect(isSlow.value).toBe(true);
    expect(type.value).toBe("2g");
  });
});
