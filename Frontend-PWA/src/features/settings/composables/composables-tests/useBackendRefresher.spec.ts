// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { effectScope, ref } from "vue";
import { flushPromises } from "@vue/test-utils";
import { useBackendRefresher } from "../useBackendRefresher";
import { triggerBackendUpdate } from "@core/api/MaintenanceClient";

// Mock MaintenanceClient
vi.mock("@core/api/MaintenanceClient", () => ({
  triggerBackendUpdate: vi.fn()
}));

// Mock SupabaseClient
vi.mock("@core/api/SupabaseClient", () => ({
  lastSyncStatus: ref(null),
}));

describe("useBackendRefresher", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("initializes with three targets in idle state", () => {
    const scope = effectScope();
    scope.run(() => {
      const { targets } = useBackendRefresher();
      expect(Object.keys(targets)).toHaveLength(3);
      expect(targets.members.status).toBe("idle");
      expect(targets.leaderboard.status).toBe("idle");
      expect(targets.headhunters.status).toBe("idle");
    });
    scope.stop();
  });

  it("triggers refresh and enters cooldown on success", async () => {
    const scope = effectScope();
    await scope.run(async () => {
      vi.mocked(triggerBackendUpdate).mockResolvedValue({
        success: true,
        data: { success: true, message: "Updated" },
        error: null
      } as any);

      const { targets, refresh } = useBackendRefresher();

      const refreshPromise = refresh("members");
      expect(targets.members.status).toBe("loading");

      await refreshPromise;
      // Drain the microtask queue so the startCooldown() continuation that runs
      // after the awaited triggerBackendUpdate() resolves is applied before asserting.
      await flushPromises();

      expect(targets.members.status).toBe("cooldown");
      expect(targets.members.cooldown).toBe(60);

      // Advance time
      vi.advanceTimersByTime(30000);
      expect(targets.members.cooldown).toBe(30);

      vi.advanceTimersByTime(30000);
      expect(targets.members.status).toBe("idle");
    });
    scope.stop();
  });

  it("enters cooldown even on failure", async () => {
    const scope = effectScope();
    await scope.run(async () => {
      vi.mocked(triggerBackendUpdate).mockResolvedValue({
        success: false,
        data: null,
        error: { code: "FAIL", message: "Failed" }
      } as any);

      const { targets, refresh } = useBackendRefresher();

      await refresh("leaderboard");
      await flushPromises();

      expect(targets.leaderboard.status).toBe("cooldown");
      expect(targets.leaderboard.cooldown).toBe(60);
    });
    scope.stop();
  });

  it("cleans up intervals on scope dispose", async () => {
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    vi.mocked(triggerBackendUpdate).mockResolvedValue({ success: true, data: { success: true, message: "ok" }, error: null } as any);

    const scope = effectScope();
    await scope.run(async () => {
      const { refresh } = useBackendRefresher();
      await refresh("members");
      await flushPromises();
    });

    scope.stop();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
