// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useVoyageForm } from "../useVoyageForm";
import { useVoyageStore } from "../useVoyageStore";

vi.mock("@core/services/useToast", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn()
  })
}));

describe("useVoyageForm", () => {
  let store: any;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useVoyageStore();
  });

  it("initializes with default values", () => {
    const { targetCrowns, startsIn, endsIn } = useVoyageForm();
    expect(targetCrowns.value).toBe(1600);
    expect(startsIn.value).toEqual({ days: 0, hours: 0, minutes: 0 });
    expect(endsIn.value).toEqual({ days: 0, hours: 0, minutes: 0 });
  });

  it("validates form correctly", async () => {
    const { targetCrowns, endsIn, isFormValid, validationHint } = useVoyageForm();

    targetCrowns.value = 0;
    expect(isFormValid.value).toBe(false);
    expect(validationHint.value).toBe("Set a crown target above 0.");

    targetCrowns.value = 1000;
    endsIn.value = { days: 1, hours: 0, minutes: 0 };
    expect(isFormValid.value).toBe(true);
  });

  describe("actions", () => {
    it("calls store.activateVoyage with sanitized inputs", async () => {
      const activateSpy = vi.spyOn(store, "activateVoyage").mockResolvedValue({ success: true } as any);
      const { targetCrowns, endsIn, handleActivate } = useVoyageForm();

      targetCrowns.value = 1000;
      endsIn.value = { days: 1, hours: 0, minutes: 0 };

      await handleActivate();
      expect(activateSpy).toHaveBeenCalled();
    });
  });
});
