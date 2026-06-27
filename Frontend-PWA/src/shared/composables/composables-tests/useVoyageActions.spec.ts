// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import { useVoyageActions } from "../useVoyageActions";
import * as VoyageClient from "@core/api/VoyageClient";
import * as coreUtils from "@core";
import type { VoyageSummary } from "../voyageTypes";

vi.mock("@core/api/VoyageClient");
vi.mock("@core", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    t2tToTimestamp: vi.fn(() => "2026-01-01T13:00:00Z")
  };
});

describe("useVoyageActions", () => {
  const summary = ref<VoyageSummary | null>(null);
  const loading = ref(false);
  const refresh = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    summary.value = null;
    loading.value = false;
  });

  describe("RPC Response Handling", () => {
    it("should succeed when RPC returns success and valid data", async () => {
      vi.mocked(VoyageClient.scheduleVoyageEvent).mockResolvedValue({
        success: true,
        data: { success: true }
      } as any);

      const actions = useVoyageActions(summary, loading, refresh);
      await actions.scheduleVoyage(1000, { days: 1, hours: 0, minutes: 0 });

      expect(refresh).toHaveBeenCalled();
    });

    it("should throw error when RPC returns success: false", async () => {
      vi.mocked(VoyageClient.scheduleVoyageEvent).mockResolvedValue({
        success: false,
        error: "Database error"
      } as any);

      const actions = useVoyageActions(summary, loading, refresh);
      await expect(actions.scheduleVoyage(1000, { days: 1, hours: 0, minutes: 0 }))
        .rejects.toThrow("Database error");
    });
  });

  describe("scheduleVoyage", () => {
    it("should call apiScheduleVoyageEvent with correct parameters", async () => {
      vi.mocked(VoyageClient.scheduleVoyageEvent).mockResolvedValue({
        success: true,
        data: { success: true }
      } as any);

      const actions = useVoyageActions(summary, loading, refresh);
      await actions.scheduleVoyage(1000, { days: 1, hours: 0, minutes: 0 });

      expect(coreUtils.t2tToTimestamp).toHaveBeenCalled();
      expect(VoyageClient.scheduleVoyageEvent).toHaveBeenCalled();
    });
  });

  describe("setVoyageEnd", () => {
    it("should succeed when an active voyage exists", async () => {
      summary.value = { event: { id: 123, status: "ACTIVE" } } as any;
      vi.mocked(VoyageClient.setVoyageEnd).mockResolvedValue({
        success: true,
        data: { success: true }
      } as any);

      const actions = useVoyageActions(summary, loading, refresh);
      await actions.setVoyageEnd({ days: 1, hours: 0, minutes: 0 });

      expect(VoyageClient.setVoyageEnd).toHaveBeenCalled();
    });
  });

  describe("cancelSchedule", () => {
    it("should succeed when a scheduled voyage exists", async () => {
      summary.value = { event: { id: 456, status: "PENDING" } } as any;
      vi.mocked(VoyageClient.cancelScheduledVoyageEvent).mockResolvedValue({
        success: true,
        data: { success: true }
      } as any);

      const actions = useVoyageActions(summary, loading, refresh);
      await actions.cancelSchedule();

      expect(VoyageClient.cancelScheduledVoyageEvent).toHaveBeenCalledWith(456);
    });
  });

  describe("activateVoyage", () => {
    it("should call apiInitializeVoyage with correct parameters", async () => {
      vi.mocked(VoyageClient.initializeVoyage).mockResolvedValue({
        success: true,
        data: { success: true }
      } as any);

      const actions = useVoyageActions(summary, loading, refresh);
      await actions.activateVoyage(2000, { days: 0, hours: 0, minutes: 0 }, { days: 7, hours: 0, minutes: 0 });

      expect(VoyageClient.initializeVoyage).toHaveBeenCalled();
    });
  });
});
