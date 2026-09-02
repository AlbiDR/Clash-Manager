// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
import { useConnectivityManager } from "../useConnectivityManager";
import { useClashDataStore } from "../useClashDataStore";
import { useConnectionStatus } from "../useConnectionStatus";
import { useApiState } from "../../api/useApiState";
import * as timeUtils from "../../utils/time";
import { ref } from "vue";
import { setActivePinia, createPinia } from "pinia";

// Mock Layer 1 dependencies via deep imports per ADR Section II
vi.mock("../useClashDataStore", () => ({
  useClashDataStore: vi.fn()
}));

vi.mock("../useConnectionStatus", () => ({
  useConnectionStatus: vi.fn()
}));

vi.mock("../../api/useApiState", () => ({
  useApiState: vi.fn()
}));

vi.mock("../../utils/time", () => ({
  formatTimeAgo: vi.fn((ts: string) => `formatted-${ts}`)
}));

describe("useConnectivityManager", () => {
  const mockStore = {
    lastSyncTime: 0,
    currentSource: null as string | null,
    lastCompiledTime: null as number | null,
    lastFetchedTime: null as number | null,
    isStale: true,
    loading: false,
    syncError: null as string | null,
    isHydrated: false,
    refresh: vi.fn()
  };

  const mockNetworkStatus = ref("online");
  const mockApiStatus = ref("online");

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();

    // Reset mock store defaults
    mockStore.lastSyncTime = 0;
    mockStore.currentSource = null;
    mockStore.lastCompiledTime = null;
    mockStore.lastFetchedTime = null;
    mockStore.isStale = true;
    mockStore.loading = false;
    mockStore.syncError = null;
    mockStore.isHydrated = false;

    vi.mocked(useClashDataStore).mockReturnValue(mockStore as any);
    vi.mocked(useConnectionStatus).mockReturnValue({ status: mockNetworkStatus } as any);
    vi.mocked(useApiState).mockReturnValue({ apiStatus: mockApiStatus } as any);
    mockNetworkStatus.value = "online";
    mockApiStatus.value = "online";
  });

  describe("hubHealth", () => {
    it("returns SYNCING state when store is loading", () => {
      mockStore.loading = true;
      const { hubHealth } = useConnectivityManager();

      expect(hubHealth.value).toEqual({
        type: "loading",
        label: "SYNCING",
        confidence: 50
      });
    });

    it("returns Sync Error state when store has a syncError (Priority 1.5)", () => {
      mockStore.syncError = "Network request failed";
      const { hubHealth } = useConnectivityManager();

      expect(hubHealth.value).toEqual({
        type: "error",
        label: "Sync Error",
        confidence: 0,
        diagnosis: "Network request failed"
      });
    });

    it("returns Invalid API URL error state when apiStatus is unconfigured (Priority 1.7)", () => {
      mockApiStatus.value = "unconfigured";
      const { hubHealth } = useConnectivityManager();

      expect(hubHealth.value).toEqual({
        type: "error",
        label: "Invalid API URL",
        confidence: 0,
        diagnosis: "Backend Configuration Error"
      });
    });

    it("prioritizes syncError over unconfigured API, offline, and stale states", () => {
      mockStore.syncError = "Fatal sync failure";
      mockApiStatus.value = "unconfigured";
      mockNetworkStatus.value = "offline";
      mockStore.lastSyncTime = Date.now() - (60 * 60 * 1000);

      const { hubHealth } = useConnectivityManager();

      expect(hubHealth.value).toEqual({
        type: "error",
        label: "Sync Error",
        confidence: 0,
        diagnosis: "Fatal sync failure"
      });
    });

    it("prioritizes unconfigured API state over offline and stale states", () => {
      mockApiStatus.value = "unconfigured";
      mockNetworkStatus.value = "offline";
      mockStore.lastSyncTime = Date.now() - (60 * 60 * 1000);

      const { hubHealth } = useConnectivityManager();

      expect(hubHealth.value).toEqual({
        type: "error",
        label: "Invalid API URL",
        confidence: 0,
        diagnosis: "Backend Configuration Error"
      });
    });

    it("returns OFFLINE state when network is disconnected", () => {
      mockNetworkStatus.value = "offline";
      const { hubHealth } = useConnectivityManager();

      expect(hubHealth.value).toEqual({
        type: "error",
        label: "OFFLINE",
        confidence: 0,
        diagnosis: "No Network Connection"
      });
    });

    it("evaluates staleness exactly at the DATA_STALENESS_MINUTES threshold", () => {
      const now = Date.now();

      // 29 minutes ago (under 30m threshold -> fresh)
      mockStore.lastSyncTime = now - (29 * 60 * 1000);
      mockStore.currentSource = "SUPABASE";
      const { hubHealth: freshHealth } = useConnectivityManager();
      expect(freshHealth.value.type).toBe("success");
      expect(freshHealth.value.confidence).toBe(100);

      // 30 minutes ago (at 30m threshold -> stale)
      mockStore.lastSyncTime = now - (30 * 60 * 1000);
      vi.mocked(timeUtils.formatTimeAgo).mockReturnValue("30m ago");
      const { hubHealth: staleHealth } = useConnectivityManager();

      expect(staleHealth.value).toEqual({
        type: "warning",
        label: "STALE",
        confidence: 40,
        diagnosis: "Data is 30m ago old"
      });
    });

    it("returns STALE state when data is older than 30 minutes", () => {
      const now = Date.now();
      mockStore.lastSyncTime = now - (31 * 60 * 1000);
      vi.mocked(timeUtils.formatTimeAgo).mockReturnValue("31m ago");

      const { hubHealth } = useConnectivityManager();

      expect(hubHealth.value).toEqual({
        type: "warning",
        label: "STALE",
        confidence: 40,
        diagnosis: "Data is 31m ago old"
      });
    });

    it("returns DB state when source is SUPABASE and data is fresh", () => {
      mockStore.currentSource = "SUPABASE";
      mockStore.lastSyncTime = Date.now() - (5 * 60 * 1000); // 5m ago

      const { hubHealth } = useConnectivityManager();

      expect(hubHealth.value).toEqual({
        type: "success",
        label: "DB",
        confidence: 100
      });
    });

    it("returns LOCAL state when source is LOCAL and data is hydrated", () => {
      mockStore.currentSource = "LOCAL";
      mockStore.isHydrated = true;
      mockStore.lastSyncTime = Date.now() - (5 * 60 * 1000); // 5m ago

      const { hubHealth } = useConnectivityManager();

      expect(hubHealth.value).toEqual({
        type: "success",
        label: "LOCAL",
        confidence: 80
      });
    });

    it("returns INITIALIZING state as fallback", () => {
      const { hubHealth } = useConnectivityManager();

      expect(hubHealth.value).toEqual({
        type: "loading",
        label: "INITIALIZING",
        confidence: 10
      });
    });
  });

  describe("metadata", () => {
    it("calculates ageMinutes correctly", () => {
      const now = Date.now();
      mockStore.lastSyncTime = now - (15 * 60 * 1000);

      const { metadata } = useConnectivityManager();

      expect(metadata.value.ageMinutes).toBe(15);
    });

    it("formats timestamps using formatTimeAgo", () => {
      const now = Date.now();
      mockStore.lastSyncTime = now;
      mockStore.lastCompiledTime = now - 1000;
      mockStore.lastFetchedTime = now - 2000;

      vi.mocked(timeUtils.formatTimeAgo).mockImplementation((ts: string) => `formatted-${ts}`);

      const { metadata } = useConnectivityManager();

      // Accessing the computed property triggers the utilities
      const { age, lastCompiled: _lastCompiled, lastFetched: _lastFetched } = metadata.value;

      expect(timeUtils.formatTimeAgo).toHaveBeenCalledTimes(3);
      expect(age).toContain("formatted-");
      expect(metadata.value.lastCompiled).toContain("formatted-");
      expect(metadata.value.lastFetched).toContain("formatted-");
    });

    it("handles null sync times gracefully", () => {
      mockStore.lastSyncTime = 0;
      const { metadata } = useConnectivityManager();

      expect(metadata.value.age).toBeNull();
      expect(metadata.value.ageMinutes).toBe(0);
    });

    it("propagates source and stale status from store", () => {
      mockStore.currentSource = "SUPABASE";
      mockStore.isStale = false;

      const { metadata } = useConnectivityManager();

      expect(metadata.value.source).toBe("SUPABASE");
      expect(metadata.value.isStale).toBe(false);
    });
  });

  describe("actions", () => {
    it("proxies refresh and loading state from store", () => {
      mockStore.loading = true;
      const { isRefreshing, refresh } = useConnectivityManager();

      expect(isRefreshing.value).toBe(true);
      refresh();
      expect(mockStore.refresh).toHaveBeenCalled();
    });
  });
});
