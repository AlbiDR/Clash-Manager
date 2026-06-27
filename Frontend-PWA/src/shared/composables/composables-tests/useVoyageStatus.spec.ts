// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
import { useVoyageStatus } from "../useVoyageStatus";
import { useVoyageStore } from "../useVoyageStore";
import { useCountdown } from "../useCountdown";
import { ref, computed, nextTick, reactive } from "vue";

vi.mock("../useVoyageStore", () => ({
  useVoyageStore: vi.fn()
}));

vi.mock("../useCountdown", () => ({
  useCountdown: vi.fn()
}));

describe("useVoyageStatus", () => {
  let mockStore: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a reactive mock to simulate Pinia's auto-unwrapping behavior
    mockStore = reactive({
      endsAt: new Date("2026-01-07T00:00:00Z"),
      startsAt: new Date("2026-01-01T00:00:00Z"),
      progressRatio: 0.456,
      refresh: vi.fn()
    });

    vi.mocked(useVoyageStore).mockReturnValue(mockStore);
    vi.mocked(useCountdown).mockImplementation((targetDate) => {
        return computed(() => `Countdown: ${targetDate.value?.toISOString()}`);
    });
  });

  it("should link to the voyage store", () => {
    const { store } = useVoyageStatus();
    expect(store).toBe(mockStore);
    expect(useVoyageStore).toHaveBeenCalled();
  });

  it("should normalize progress to a rounded percentage", async () => {
    const { progressPercent } = useVoyageStatus();

    expect(progressPercent.value).toBe(46);

    mockStore.progressRatio = 0.123;
    await nextTick();
    expect(progressPercent.value).toBe(12);

    mockStore.progressRatio = 0.999;
    await nextTick();
    expect(progressPercent.value).toBe(100);
  });

  it("should orchestrate countdowns with correct target dates", () => {
    useVoyageStatus();

    expect(useCountdown).toHaveBeenCalledTimes(2);

    // First call for timeRemaining (endsAt)
    const [targetDate1] = vi.mocked(useCountdown).mock.calls[0];
    expect(targetDate1.value).toEqual(mockStore.endsAt);

    // Second call for startsInCountdown (startsAt)
    const [targetDate2] = vi.mocked(useCountdown).mock.calls[1];
    expect(targetDate2.value).toEqual(mockStore.startsAt);
  });

  it("should propagate showDays option to countdowns", () => {
    useVoyageStatus({ showDays: true });

    expect(vi.mocked(useCountdown)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ showDays: true })
    );

    useVoyageStatus({ showDays: false });
    expect(vi.mocked(useCountdown)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ showDays: false })
      );
  });

  it("should trigger store refresh on countdown expiry", () => {
    useVoyageStatus();

    const options1 = vi.mocked(useCountdown).mock.calls[0][1];
    const options2 = vi.mocked(useCountdown).mock.calls[1][1];

    expect(options1?.onExpiry).toBeDefined();
    expect(options2?.onExpiry).toBeDefined();

    options1?.onExpiry?.();
    expect(mockStore.refresh).toHaveBeenCalledTimes(1);

    options2?.onExpiry?.();
    expect(mockStore.refresh).toHaveBeenCalledTimes(2);
  });

  it("should maintain reactivity when store dates change", async () => {
    useVoyageStatus();

    const [targetDate1] = vi.mocked(useCountdown).mock.calls[0];
    const [targetDate2] = vi.mocked(useCountdown).mock.calls[1];

    const newEndsAt = new Date("2026-02-01T00:00:00Z");
    mockStore.endsAt = newEndsAt;
    await nextTick();
    expect(targetDate1.value).toEqual(newEndsAt);

    const newStartsAt = new Date("2026-01-15T00:00:00Z");
    mockStore.startsAt = newStartsAt;
    await nextTick();
    expect(targetDate2.value).toEqual(newStartsAt);
  });
});
