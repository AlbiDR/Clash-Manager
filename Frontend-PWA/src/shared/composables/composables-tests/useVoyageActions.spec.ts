// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment node
 *
 * No DOM in this file, so it skips jsdom entirely. Building a jsdom Window
 * costs ~410ms per test file and dominated the suite (80.6s of ~120s CPU,
 * against 8.1s of actual test execution). Adding anything here that touches
 * `document`, `window`, `localStorage` or mounts a component will fail loudly
 * and immediately - remove this docblock if that is intentional.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref } from "vue";
import { useVoyageActions } from "../useVoyageActions";
import * as VoyageClient from "@core/api/VoyageClient";
import * as coreUtils from "@core";
import type { VoyageSummary } from "../voyageTypes";

vi.mock("@core/api/VoyageClient", () => ({
  initializeVoyage: vi.fn(),
  scheduleVoyageEvent: vi.fn(),
  cancelScheduledVoyageEvent: vi.fn(),
  setVoyageEnd: vi.fn()
}));

vi.mock("@core", () => ({
  t2tToTimestamp: vi.fn((input) => `MOCKED_TIMESTAMP_${JSON.stringify(input)}`)
}));

describe("useVoyageActions", () => {
  const summary = ref<VoyageSummary | null>(null);
  const loading = ref(false);
  const refresh = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    summary.value = null;
    loading.value = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const actions = useVoyageActions(summary, loading, refresh);

  describe("RPC Response Handling", () => {
    it("should succeed when RPC returns success and valid data", async () => {
      vi.mocked(VoyageClient.scheduleVoyageEvent).mockResolvedValue({
        success: true,
        data: { success: true }
      });

      await actions.scheduleVoyage(1000, { days: 1, hours: 0, minutes: 0 });

      expect(refresh).toHaveBeenCalled();
      expect(loading.value).toBe(false);
    });

    it("should throw error when RPC validation fails (invalid data shape)", async () => {
      vi.mocked(VoyageClient.scheduleVoyageEvent).mockResolvedValue({
        success: true,
        data: { success: "not-a-boolean" } // Invalid shape
      } as any);

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(actions.scheduleVoyage(1000, { days: 1, hours: 0, minutes: 0 }))
        .rejects.toThrow("Scheduling returned invalid data shape");

      expect(consoleSpy).toHaveBeenCalledWith(
        "[Voyage] Scheduling response validation failed:",
        expect.any(Array)
      );
      expect(refresh).not.toHaveBeenCalled();
    });

    it("should throw error when RPC reports logical failure", async () => {
      vi.mocked(VoyageClient.scheduleVoyageEvent).mockResolvedValue({
        success: true,
        data: { success: false, error: "Concurrency conflict" }
      });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(actions.scheduleVoyage(1000, { days: 1, hours: 0, minutes: 0 }))
        .rejects.toThrow("Concurrency conflict");

      expect(consoleSpy).toHaveBeenCalledWith(
        "[Voyage] Scheduling failed (logic):",
        "Concurrency conflict"
      );
      expect(refresh).not.toHaveBeenCalled();
    });

    it("should throw error when RPC reports network/auth failure", async () => {
      vi.mocked(VoyageClient.scheduleVoyageEvent).mockResolvedValue({
        success: false,
        error: "Unauthorized access"
      });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(actions.scheduleVoyage(1000, { days: 1, hours: 0, minutes: 0 }))
        .rejects.toThrow("Unauthorized access");

      expect(consoleSpy).toHaveBeenCalledWith(
        "[Voyage] Scheduling failed (network/auth):",
        "Unauthorized access"
      );
      expect(refresh).not.toHaveBeenCalled();
    });
  });

  describe("scheduleVoyage", () => {
    it("should call apiScheduleVoyageEvent with correct parameters", async () => {
      vi.mocked(VoyageClient.scheduleVoyageEvent).mockResolvedValue({
        success: true,
        data: { success: true }
      });

      const target = 5000;
      const startsIn = { days: 2, hours: 1, minutes: 30 };
      await actions.scheduleVoyage(target, startsIn);

      expect(coreUtils.t2tToTimestamp).toHaveBeenCalledWith(startsIn);
      expect(VoyageClient.scheduleVoyageEvent).toHaveBeenCalledWith(
        target,
        `MOCKED_TIMESTAMP_${JSON.stringify(startsIn)}`
      );
    });
  });

  describe("setVoyageEnd", () => {
    it("should succeed when an active voyage exists", async () => {
      summary.value = { event: { id: 123 } } as any;
      vi.mocked(VoyageClient.setVoyageEnd).mockResolvedValue({
        success: true,
        data: { success: true }
      });

      const endsIn = { days: 7, hours: 0, minutes: 0 };
      await actions.setVoyageEnd(endsIn);

      expect(VoyageClient.setVoyageEnd).toHaveBeenCalledWith(
        123,
        `MOCKED_TIMESTAMP_${JSON.stringify(endsIn)}`
      );
      expect(refresh).toHaveBeenCalled();
    });

    it("should throw error if no active voyage is found in summary", async () => {
      summary.value = null;
      await expect(actions.setVoyageEnd({ days: 1, hours: 0, minutes: 0 }))
        .rejects.toThrow("No active voyage found.");
    });
  });

  describe("cancelSchedule", () => {
    it("should succeed when a scheduled voyage exists", async () => {
      summary.value = { event: { id: 456 } } as any;
      vi.mocked(VoyageClient.cancelScheduledVoyageEvent).mockResolvedValue({
        success: true,
        data: { success: true }
      });

      await actions.cancelSchedule();

      expect(VoyageClient.cancelScheduledVoyageEvent).toHaveBeenCalledWith(456);
      expect(refresh).toHaveBeenCalled();
    });

    it("should throw error if no scheduled voyage is active", async () => {
      summary.value = null;
      await expect(actions.cancelSchedule())
        .rejects.toThrow("No scheduled voyage is active.");
    });
  });

  describe("activateVoyage", () => {
    it("should call apiInitializeVoyage with correct parameters", async () => {
      vi.mocked(VoyageClient.initializeVoyage).mockResolvedValue({
        success: true,
        data: { success: true }
      });

      const target = 10000;
      const startsIn = { days: 0, hours: 0, minutes: 0 };
      const endsIn = { days: 5, hours: 0, minutes: 0 };

      await actions.activateVoyage(target, startsIn, endsIn);

      expect(VoyageClient.initializeVoyage).toHaveBeenCalledWith(
        target,
        `MOCKED_TIMESTAMP_${JSON.stringify(startsIn)}`,
        `MOCKED_TIMESTAMP_${JSON.stringify(endsIn)}`
      );
      expect(refresh).toHaveBeenCalled();
    });
  });

  describe("Loading State Management", () => {
    it("should toggle loading state during execution", async () => {
      vi.mocked(VoyageClient.scheduleVoyageEvent).mockImplementation(async () => {
        expect(loading.value).toBe(true);
        return { success: true, data: { success: true } };
      });

      await actions.scheduleVoyage(1000, { days: 1, hours: 0, minutes: 0 });
      expect(loading.value).toBe(false);
    });

    it("should reset loading state even if execution fails", async () => {
      vi.mocked(VoyageClient.scheduleVoyageEvent).mockRejectedValue(new Error("Network Error"));

      await expect(actions.scheduleVoyage(1000, { days: 1, hours: 0, minutes: 0 }))
        .rejects.toThrow("Network Error");

      expect(loading.value).toBe(false);
    });
  });
});
