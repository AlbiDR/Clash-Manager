// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useVoyageForm } from "../useVoyageForm";
import { useVoyageStore } from "../useVoyageStore";

// Mock SupabaseClient because useVoyageStore uses it
vi.mock("@core/api/SupabaseClient", () => ({
  createSupabaseClient: vi.fn(() => ({
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn()
    }))
  }))
}));

vi.mock("@core/api/VoyageClient", () => ({
  initializeVoyage: vi.fn(),
  fetchVoyageSummary: vi.fn(),
  fetchVoyageContributions: vi.fn(),
  scheduleVoyageEvent: vi.fn(),
  cancelScheduledVoyageEvent: vi.fn(),
  setVoyageEnd: vi.fn(),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("@core/services/useToast", () => ({
  useToast: () => ({
    success: mockToastSuccess,
    error: mockToastError,
  }),
}));

describe("useVoyageForm", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    mockToastSuccess.mockClear();
    mockToastError.mockClear();
  });

  it("initializes with default values", () => {
    const { targetCrowns, startsIn, endsIn } = useVoyageForm();
    expect(targetCrowns.value).toBe(1600);
    expect(startsIn.value).toEqual({ days: 0, hours: 0, minutes: 0 });
    expect(endsIn.value).toEqual({ days: 0, hours: 0, minutes: 0 });
  });

  it("validates form correctly", async () => {
    const { targetCrowns, endsIn, isFormValid, validationHint } = useVoyageForm();

    // Invalid: target is 0
    targetCrowns.value = 0;
    expect(isFormValid.value).toBe(false);
    expect(validationHint.value).toBe("Set a crown target above 0.");

    // Invalid: endsIn is 0
    targetCrowns.value = 1600;
    endsIn.value = { days: 0, hours: 0, minutes: 0 };
    expect(isFormValid.value).toBe(false);

    // Valid: target > 0 and endsIn > startsIn (0)
    endsIn.value = { days: 1, hours: 0, minutes: 0 };
    expect(isFormValid.value).toBe(true);
    expect(validationHint.value).toBe(null);
  });

  it("handles target input clamping", () => {
    const { targetCrowns, onTargetInput } = useVoyageForm();

    targetCrowns.value = 10000;
    onTargetInput();
    expect(targetCrowns.value).toBe(9999);

    targetCrowns.value = -5;
    onTargetInput();
    expect(targetCrowns.value).toBe(0);
  });

  it("calls store.activateVoyage with sanitized inputs", async () => {
    const { targetCrowns, endsIn, handleActivate } = useVoyageForm();
    const store = useVoyageStore();
    const activateSpy = vi.spyOn(store, "activateVoyage").mockResolvedValue(undefined as any);

    targetCrowns.value = 2000;
    endsIn.value = { days: 1, hours: 2, minutes: 3 };

    await handleActivate();

    expect(activateSpy).toHaveBeenCalledWith(
      2000,
      { days: 0, hours: 0, minutes: 0 },
      { days: 1, hours: 2, minutes: 3 }
    );
  });

  describe("modes and validation", () => {
    it("identifies isScheduleOnlyMode correctly", () => {
      const { startsIn, endsIn, isScheduleOnlyMode } = useVoyageForm();
      const store = useVoyageStore();

      expect(store.status).toBe("IDLE");

      startsIn.value = { days: 1, hours: 0, minutes: 0 };
      endsIn.value = { days: 0, hours: 0, minutes: 0 };
      expect(isScheduleOnlyMode.value).toBe(true);

      endsIn.value = { days: 2, hours: 0, minutes: 0 };
      expect(isScheduleOnlyMode.value).toBe(false);
    });

    it("validates for ACTIVE status correctly", () => {
      const { endsIn, isFormValid, validationHint } = useVoyageForm();
      const store = useVoyageStore();

      // @ts-expect-error -- test mock/state does not satisfy the full type
      store.summary = { event: { status: "ACTIVE" } };

      endsIn.value = { days: 0, hours: 0, minutes: 0 };
      expect(isFormValid.value).toBe(false);
      expect(validationHint.value).toBe("Set an 'Ends In' duration.");

      endsIn.value = { days: 1, hours: 0, minutes: 0 };
      expect(isFormValid.value).toBe(true);
      expect(validationHint.value).toBe(null);
    });

    it("validates for AWAITING_END correctly", () => {
      const { endsIn, isFormValid, validationHint: _validationHint, isAwaitingEndSet } = useVoyageForm();
      const store = useVoyageStore();

      // @ts-expect-error -- test mock/state does not satisfy the full type
      store.summary = { event: { status: "ACTIVE", end_at: null } };
      expect(isAwaitingEndSet.value).toBe(true);

      endsIn.value = { days: 0, hours: 0, minutes: 0 };
      expect(isFormValid.value).toBe(false);

      endsIn.value = { days: 1, hours: 0, minutes: 0 };
      expect(isFormValid.value).toBe(true);
    });

    it("validates for PENDING/Future setup correctly", () => {
      const { startsIn, endsIn, isFormValid, validationHint } = useVoyageForm();

      startsIn.value = { days: 1, hours: 0, minutes: 0 };
      endsIn.value = { days: 1, hours: 0, minutes: 0 };
      expect(isFormValid.value).toBe(false);
      expect(validationHint.value).toBe("'Ends In' must be after 'Starts In'.");

      endsIn.value = { days: 2, hours: 0, minutes: 0 };
      expect(isFormValid.value).toBe(true);
    });
  });

  describe("actions", () => {
    it("handles handleCancel with confirmation", async () => {
      const { handleCancel } = useVoyageForm();
      const store = useVoyageStore();
      const cancelSpy = vi.spyOn(store, "cancelSchedule").mockResolvedValue(undefined as any);
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

      await handleCancel();
      expect(confirmSpy).toHaveBeenCalled();
      expect(cancelSpy).toHaveBeenCalled();

      confirmSpy.mockReturnValue(false);
      await handleCancel();
      expect(cancelSpy).toHaveBeenCalledTimes(1); // Not called again
    });

    it("handles handleSetEnd correctly", async () => {
      const { endsIn, handleSetEnd } = useVoyageForm();
      const store = useVoyageStore();
      const setEndSpy = vi.spyOn(store, "setVoyageEnd").mockResolvedValue(undefined as any);

      endsIn.value = { days: 1, hours: 0, minutes: 0 };
      await handleSetEnd();

      expect(setEndSpy).toHaveBeenCalledWith({ days: 1, hours: 0, minutes: 0 });
    });
  });

  describe("sad paths & error handling", () => {
    let consoleErrorSpy: any;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    it("handleActivate: handles Error instance rejection", async () => {
      const { targetCrowns, endsIn, handleActivate } = useVoyageForm();
      const store = useVoyageStore();

      const testError = new Error("Activation failed error");
      vi.spyOn(store, "activateVoyage").mockRejectedValue(testError);

      targetCrowns.value = 2000;
      endsIn.value = { days: 1, hours: 2, minutes: 3 };

      await handleActivate();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[useVoyageForm] handleActivate error:",
        testError
      );
      expect(mockToastError).toHaveBeenCalledWith("Activation failed error");
    });

    it("handleActivate: handles non-Error rejection", async () => {
      const { targetCrowns, endsIn, handleActivate } = useVoyageForm();
      const store = useVoyageStore();

      vi.spyOn(store, "activateVoyage").mockRejectedValue("some raw error string");

      targetCrowns.value = 2000;
      endsIn.value = { days: 1, hours: 2, minutes: 3 };

      await handleActivate();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[useVoyageForm] handleActivate error:",
        "some raw error string"
      );
      expect(mockToastError).toHaveBeenCalledWith("Operation failed.");
    });

    it("handleCancel: handles Error instance rejection", async () => {
      const { handleCancel } = useVoyageForm();
      const store = useVoyageStore();

      const testError = new Error("Cancellation failed error");
      vi.spyOn(store, "cancelSchedule").mockRejectedValue(testError);
      vi.spyOn(window, "confirm").mockReturnValue(true);

      await handleCancel();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[useVoyageForm] handleCancel error:",
        testError
      );
      expect(mockToastError).toHaveBeenCalledWith("Cancellation failed error");
    });

    it("handleCancel: handles non-Error rejection", async () => {
      const { handleCancel } = useVoyageForm();
      const store = useVoyageStore();

      vi.spyOn(store, "cancelSchedule").mockRejectedValue({ code: 500, detail: "DB offline" });
      vi.spyOn(window, "confirm").mockReturnValue(true);

      await handleCancel();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[useVoyageForm] handleCancel error:",
        { code: 500, detail: "DB offline" }
      );
      expect(mockToastError).toHaveBeenCalledWith("Cancellation failed.");
    });

    it("handleSetEnd: handles Error instance rejection", async () => {
      const { endsIn, handleSetEnd } = useVoyageForm();
      const store = useVoyageStore();

      const testError = new Error("Set end failed error");
      vi.spyOn(store, "setVoyageEnd").mockRejectedValue(testError);

      endsIn.value = { days: 1, hours: 0, minutes: 0 };
      await handleSetEnd();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[useVoyageForm] handleSetEnd error:",
        testError
      );
      expect(mockToastError).toHaveBeenCalledWith("Set end failed error");
    });

    it("handleSetEnd: handles non-Error rejection", async () => {
      const { endsIn, handleSetEnd } = useVoyageForm();
      const store = useVoyageStore();

      vi.spyOn(store, "setVoyageEnd").mockRejectedValue(null);

      endsIn.value = { days: 1, hours: 0, minutes: 0 };
      await handleSetEnd();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[useVoyageForm] handleSetEnd error:",
        null
      );
      expect(mockToastError).toHaveBeenCalledWith("Setting end time failed.");
    });
  });
});
