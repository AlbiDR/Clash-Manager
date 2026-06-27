// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
import { useVoyageStatus } from "../useVoyageStatus";
import * as VoyageStore from "../useVoyageStore";
import { computed, nextTick, reactive } from "vue";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../useVoyageStore", () => ({
  useVoyageStore: vi.fn()
}));

vi.mock("@shared", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    useCountdown: vi.fn((targetDate) => {
        return computed(() => `Countdown: ${targetDate.value?.toISOString()}`);
    })
  };
});

describe("useVoyageStatus", () => {
  let mockStore: any;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();

    mockStore = reactive({
      endsAt: new Date("2026-01-07T00:00:00Z"),
      startsAt: new Date("2026-01-01T00:00:00Z"),
      progressRatio: 0.456,
      refresh: vi.fn()
    });

    vi.mocked(VoyageStore.useVoyageStore).mockReturnValue(mockStore);
  });

  it("should link to the voyage store", () => {
    const { store } = useVoyageStatus();
    expect(store).toBe(mockStore);
  });

  it("should normalize progress to a rounded percentage", async () => {
    const { progressPercent } = useVoyageStatus();
    expect(progressPercent.value).toBe(46);
  });
});
