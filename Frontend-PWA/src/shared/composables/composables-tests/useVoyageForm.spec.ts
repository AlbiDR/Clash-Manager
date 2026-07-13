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

vi.mock("@core/services/useToast", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("useVoyageForm", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
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

      // @ts-ignore
      store.summary = { event: { status: "ACTIVE" } };

      endsIn.value = { days: 0, hours: 0, minutes: 0 };
      expect(isFormValid.value).toBe(false);
      expect(validationHint.value).toBe("Set an 'Ends In' duration.");

      endsIn.value = { days: 1, hours: 0, minutes: 0 };
      expect(isFormValid.value).toBe(true);
      expect(validationHint.value).toBe(null);
    });

    it("validates for AWAITING_END correctly", () => {
      const { endsIn, isFormValid, validationHint, isAwaitingEndSet } = useVoyageForm();
      const store = useVoyageStore();

      // @ts-ignore
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
});
